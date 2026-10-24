import { createServiceRuntime } from '../db/serviceRuntime';
import {
  createPlan,
  getLookWithItems,
  planOutfitIds,
  softDeletePlan,
  updatePlanRow,
  type GarmentDb,
  type PlanDetail,
} from '../db/dao';
import type { PlanRow } from '../db/schema';
import { uuidv7 } from '../id/uuidv7';

/**
 * 计划服务（MVP-009）。结构仿 lookService：
 * - `*Core(db, …)`：可注入持久逻辑，设备单例与 host 测试共用同一代码路径。
 * - 单例 API：readyDb + 写后 writeMirror 落持久镜像（plans 随 GarmentDump 进 v7 镜像）。
 *
 * 领域规则：
 * - date 是当地日期字面量，服务层不做任何时区换算——时区只在「今天是什么」
 *   （calendar.todayLocal）出现一次。
 * - 关联造型的计划在保存时把造型单品展开成 outfit 快照：造型之后被删/改，
 *   计划展示与修复入口都不缺数据（lookMissing 标记由读取时计算）。
 * - 记录已穿幂等：completed/changed 之后再次记录不改 completedAt、不产生第二条事实。
 */

export interface SavePlanInput {
  /** 提供且已存在 → 更新；否则新建。 */
  id?: string;
  /** YYYY-MM-DD 当地日期。 */
  date: string;
  timeLabel: string;
  occasion?: string | null;
  /** 关联造型；null = 临时组合（用 garmentIds）；更新时缺省 = 保持原有关联。 */
  lookId?: string | null;
  garmentIds?: readonly string[];
  note?: string | null;
}

/* ---------------- 可注入 Core ---------------- */

async function toDetail(db: GarmentDb, plan: PlanRow): Promise<PlanDetail> {
  let lookMissing = false;
  if (plan.lookId) {
    lookMissing = (await getLookWithItems(db, plan.lookId)) == null;
  }
  return { plan, outfitGarmentIds: planOutfitIds(plan), lookMissing };
}

/** upsert 计划：关联造型时展开快照；返回保存后的详情。 */
export async function savePlanCore(db: GarmentDb, input: SavePlanInput): Promise<PlanDetail> {
  const now = Date.now();
  let outfitGarmentIds: readonly string[] = input.garmentIds ?? [];
  if (input.lookId) {
    const look = await getLookWithItems(db, input.lookId);
    if (!look) throw new Error(`look not found or deleted: ${input.lookId}`);
    outfitGarmentIds = look.items.map((i) => i.garmentId);
  }
  const existing = input.id ? await db.getPlan(input.id) : null;
  if (existing && existing.deletedAt == null) {
    const id = input.id!;
    await updatePlanRow(
      db,
      id,
      {
        date: input.date,
        timeLabel: input.timeLabel,
        occasion: input.occasion ?? null,
        lookId: input.lookId === undefined ? existing.lookId : input.lookId,
        outfitGarmentIds,
        note: input.note ?? null,
      },
      now,
    );
    const plan = (await db.getPlan(id))!;
    return toDetail(db, plan);
  }
  const id = input.id ?? uuidv7();
  await createPlan(db, {
    id,
    date: input.date,
    timeLabel: input.timeLabel,
    occasion: input.occasion,
    lookId: input.lookId,
    outfitGarmentIds,
    note: input.note,
    now,
  });
  const plan = await db.getPlan(id);
  if (!plan) throw new Error(`savePlan succeeded but row missing: ${id}`);
  return toDetail(db, plan);
}

export async function getPlanCore(db: GarmentDb, id: string): Promise<PlanDetail | null> {
  const plan = await db.getPlan(id);
  if (!plan || plan.deletedAt != null) return null;
  return toDetail(db, plan);
}

/** 某日全部活动计划（同日多时段，按创建序）。 */
export async function plansForDateCore(db: GarmentDb, date: string): Promise<PlanRow[]> {
  const all = await db.listActivePlans();
  return all.filter((p) => p.date === date);
}

/** 窗口内全部活动计划（月历含跨月 spillover；字符串日期字典序即时间序）。 */
export async function listPlansInRangeCore(db: GarmentDb, start: string, end: string): Promise<PlanRow[]> {
  const all = await db.listActivePlans();
  return all.filter((p) => p.date >= start && p.date <= end);
}

/** 移动计划到另一日期（编辑的一种，可恢复：行不删）。 */
export async function movePlanCore(db: GarmentDb, id: string, newDate: string): Promise<void> {
  const plan = await db.getPlan(id);
  if (!plan || plan.deletedAt != null) throw new Error(`plan not found or deleted: ${id}`);
  await updatePlanRow(db, id, { date: newDate }, Date.now());
}

/** 软删计划（墓碑）；绝不动关联造型。 */
export async function deletePlanCore(db: GarmentDb, id: string): Promise<void> {
  await softDeletePlan(db, id, Date.now());
}

export interface RecordWornInput {
  /** true=按计划穿（completed）；false=计划有变化（changed，需 changeNote）。 */
  asPlanned: boolean;
  changeNote?: string | null;
  now?: number;
}

/**
 * 记录实际已穿：与计划同表分列，不写 recommendations/wear_logs（两条独立事实）。
 * 幂等：已 completed/changed 的计划再次记录原样返回，不改 completedAt。
 */
export async function recordWornCore(db: GarmentDb, id: string, input: RecordWornInput): Promise<PlanDetail> {
  const plan = await db.getPlan(id);
  if (!plan || plan.deletedAt != null) throw new Error(`plan not found or deleted: ${id}`);
  if (plan.status !== 'planned') return toDetail(db, plan); // 幂等
  const now = input.now ?? Date.now();
  if (input.asPlanned) {
    await updatePlanRow(db, id, { status: 'completed', completedAt: now }, now);
  } else {
    await updatePlanRow(
      db,
      id,
      { status: 'changed', completedAt: now, changeNote: input.changeNote ?? null },
      now,
    );
  }
  return toDetail(db, (await db.getPlan(id))!);
}

/* ---------------- 设备单例 ---------------- */

const rt = createServiceRuntime();

export async function savePlan(input: SavePlanInput): Promise<PlanDetail> {
  const detail = await savePlanCore((await rt.readyDb()).db, input);
  await rt.persist();
  return detail;
}

export async function getPlan(id: string): Promise<PlanDetail | null> {
  return getPlanCore((await rt.readyDb()).db, id);
}

export async function plansForDate(date: string): Promise<PlanRow[]> {
  return plansForDateCore((await rt.readyDb()).db, date);
}

export async function listPlansInRange(start: string, end: string): Promise<PlanRow[]> {
  return listPlansInRangeCore((await rt.readyDb()).db, start, end);
}

export async function movePlan(id: string, newDate: string): Promise<void> {
  await movePlanCore((await rt.readyDb()).db, id, newDate);
  await rt.persist();
}

export async function deletePlan(id: string): Promise<void> {
  await deletePlanCore((await rt.readyDb()).db, id);
  await rt.persist();
}

export async function recordWorn(id: string, input: RecordWornInput): Promise<PlanDetail> {
  const detail = await recordWornCore((await rt.readyDb()).db, id, input);
  await rt.persist();
  return detail;
}

/** 仅测试/调试：重置单例（不删数据）。 */
export function __resetForTest() {
  rt.resetForTest();
}
