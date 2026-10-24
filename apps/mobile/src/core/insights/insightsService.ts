/**
 * 洞察服务（MVP-011）：从 wear_logs/wear_log_items/garments 装配事实，
 * 喂给 metrics.ts 纯函数；不接 schema 变更、不持久化（实时算）。
 *
 * 设计原则：
 * - 仿 planService/lookService 双层结构：`*Core(db, statsDb, …)` 可注入，
 *   设备单例 readyDb 后调用 Core，便于 host 测试与设备共用同一代码路径。
 * - **双 db 模式**（与 wardrobe/query.ts 一致）：`db: GarmentDb` 调 dao 方法
 *   （listAllGarments）；`statsDb: AnyDb` 是 drizzle 实例，调 wearLog.listWearLogs
 *   （后者签名要求 drizzle 实例）。测试用 t.drizzleDb 同时传两边；设备用
 *   app.db + app.drizzleDb。
 * - **不写镜像**：洞察结果不持久化（任务卡「编辑/删除穿着记录后重新聚合」
 *   要求实时算），只读 wear_logs/wear_log_items/garments 三个已有事实表。
 * - **装配层过滤墓碑 items**：wear_log_items 可能引用已墓碑 garments
 *   （onDelete: 'cascade' 仅物理删；本应用只走墓碑，行保留），装配时按
 *   validIds 过滤；纯函数层亦按 validIds 双层过滤防御。
 * - 时区：date 是 wear_logs.date 当地日期字面量（与 plans/trips 同语义），
 *   装配层不做 epoch 转换；切时区不偏移。
 */
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';

import * as schema from '../db/schema';
import { createServiceRuntime } from '../db/serviceRuntime';
import type { GarmentDb } from '../db/dao';
import { listActiveGarmentsWithThumbs } from '../garments/service';
import { listWearLogs } from '../recommend/wearLog';
import type { GarmentRow } from '../db/schema';

import {
  buildShareableReport,
  computeCostPerWearList,
  computeIdleReport,
  computeMonthlyReport,
  computeWardrobeOverview,
  hasProtectedLeak,
  type GarmentCostRow,
  type GarmentFact,
  type IdleReport,
  type MonthlyReport,
  type ShareableReport,
  type WardrobeOverview,
  type WearLogFact,
} from './metrics';

type AnyDb = ExpoSQLiteDatabase<typeof schema> | BetterSQLite3Database<typeof schema>;

/** 装配结果：纯函数输入事实 + 关联的 GarmentRow（UI 展示用）。 */
export interface InsightsFacts {
  wearLogs: WearLogFact[];
  garments: GarmentFact[];
  /** id → GarmentRow，UI 显示名称/缩略图用（不含墓碑）。 */
  garmentRows: Map<string, GarmentRow>;
}

/** 总览视图：含指标 + 名称/缩略图附属信息。 */
export interface OverviewView {
  overview: WardrobeOverview;
  /** 学习期时显示如何产生数据。 */
  learningHint: string | null;
}

export interface IdleView {
  report: IdleReport;
  /** id → GarmentRow，UI 显示名称/缩略图。 */
  garmentRows: Map<string, GarmentRow>;
}

export interface CostPerWearView {
  rows: GarmentCostRow[];
  /** id → GarmentRow，UI 显示名称/缩略图。 */
  garmentRows: Map<string, GarmentRow>;
}

export interface MonthlyView {
  monthly: MonthlyReport;
  shareable: ShareableReport;
  /** 脱敏产物是否泄漏受保护字段（应恒为 false，UI 显示告警）。 */
  hasLeak: boolean;
}

/* ---------------- 可注入 Core ---------------- */

/** 把 WearLogWithItems + GarmentRow[] 装配成 InsightsFacts（过滤墓碑 items）。 */
export function assembleFacts(
  wearLogs: Awaited<ReturnType<typeof listWearLogs>>,
  garmentRows: GarmentRow[],
): InsightsFacts {
  const validIds = new Set<string>();
  for (const g of garmentRows) {
    if (g.deletedAt == null) validIds.add(g.id);
  }
  const garmentRowMap = new Map<string, GarmentRow>();
  for (const g of garmentRows) {
    if (g.deletedAt == null) garmentRowMap.set(g.id, g);
  }

  const wearLogFacts: WearLogFact[] = wearLogs.map((w) => ({
    id: w.id,
    date: w.date,
    createdAt: w.createdAt,
    // 装配层过滤墓碑 items（双层防御：纯函数层再过滤一次）
    garmentIds: w.items.map((it) => it.garmentId).filter((id) => validIds.has(id)),
  }));

  const garmentFacts: GarmentFact[] = garmentRows.map((g) => ({
    id: g.id,
    category: g.category,
    priceMinor: g.priceMinor,
    purchaseDate: g.purchaseDate,
    archivedAt: g.archivedAt,
    deletedAt: g.deletedAt,
    createdAt: g.createdAt,
  }));

  return { wearLogs: wearLogFacts, garments: garmentFacts, garmentRows: garmentRowMap };
}

const LEARNING_HINT = '已记录穿着天数不足 7 天，再连续记录几天，洞察会更准确。';

async function loadFacts(db: GarmentDb, statsDb: AnyDb): Promise<InsightsFacts> {
  const [wearLogs, garmentRows] = await Promise.all([listWearLogs(statsDb), db.listAllGarments()]);
  return assembleFacts(wearLogs, garmentRows);
}

/** 总览：盘活单品/重复率/学习期。 */
export async function getOverviewCore(db: GarmentDb, statsDb: AnyDb, now: number): Promise<OverviewView> {
  const facts = await loadFacts(db, statsDb);
  const overview = computeWardrobeOverview(facts.wearLogs, facts.garments, now);
  return {
    overview,
    learningHint: overview.isLearningPeriod ? LEARNING_HINT : null,
  };
}

/** 久未穿：30/60/90 + 新录入未穿。 */
export async function getIdleReportCore(
  db: GarmentDb,
  statsDb: AnyDb,
  now: number,
): Promise<IdleView> {
  const facts = await loadFacts(db, statsDb);
  const report = computeIdleReport(facts.wearLogs, facts.garments, now);
  return { report, garmentRows: facts.garmentRows };
}

/** 成本/次列表：最划算在前，0 次或无价为 null。 */
export async function getCostPerWearListCore(db: GarmentDb, statsDb: AnyDb): Promise<CostPerWearView> {
  const facts = await loadFacts(db, statsDb);
  const rows = computeCostPerWearList(facts.wearLogs, facts.garments);
  return { rows, garmentRows: facts.garmentRows };
}

/** 月度报告 + 脱敏分享快照。 */
export async function getMonthlyReportCore(
  db: GarmentDb,
  statsDb: AnyDb,
  yearMonth: string,
  now: number,
): Promise<MonthlyView> {
  const facts = await loadFacts(db, statsDb);
  const overview = computeWardrobeOverview(facts.wearLogs, facts.garments, now);
  const monthly = computeMonthlyReport(facts.wearLogs, yearMonth);
  const shareable = buildShareableReport(overview, monthly, now);
  // hasProtectedLeak 是兜底校验：脱敏产物理论上恒不泄漏，泄漏说明本模块写错。
  return { monthly, shareable, hasLeak: hasProtectedLeak(shareable) };
}

/* ---------------- 设备单例（只读，不写镜像）---------------- */

const rt = createServiceRuntime();

/** 衣物名 + 缩略图（用于洞察列表展示）；不依赖穿过的衣物，归档也包括。 */
export async function listGarmentThumbs(): Promise<Map<string, string | null>> {
  const rows = await listActiveGarmentsWithThumbs();
  return new Map(rows.map((r) => [r.garment.id, r.imageRelPath]));
}

export async function getOverview(now: number): Promise<OverviewView> {
  const app = await rt.readyDb();
  return getOverviewCore(app.db, app.drizzleDb, now);
}

export async function getIdleReport(now: number): Promise<IdleView> {
  const app = await rt.readyDb();
  return getIdleReportCore(app.db, app.drizzleDb, now);
}

export async function getCostPerWearList(): Promise<CostPerWearView> {
  const app = await rt.readyDb();
  return getCostPerWearListCore(app.db, app.drizzleDb);
}

export async function getMonthlyReport(yearMonth: string, now: number): Promise<MonthlyView> {
  const app = await rt.readyDb();
  return getMonthlyReportCore(app.db, app.drizzleDb, yearMonth, now);
}

/** 仅测试/调试：重置单例（不删数据）。 */
export function __resetForTest() {
  rt.resetForTest();
}
