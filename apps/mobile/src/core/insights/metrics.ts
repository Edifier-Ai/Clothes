/**
 * 衣橱洞察纯函数（MVP-011 领域层预研）。
 *
 * 设计原则：
 * - 纯函数 + 固定输入，不直接接 db —— 便于测试与不依赖 schema 变更；
 *   db 适配层（从 wear_logs/wear_log_items/garments 装配 WearLogFact/GarmentFact）
 *   待 MVP-010 ACCEPTED 后接 UI 时补，避免与 MVP-010 的 schema v8 迁移冲突返工。
 * - 数据源是 MVP-005（wear_logs）+ MVP-007（garments/archived）已有事实，不依赖 MVP-010。
 * - 成本/次口径复用 MVP-007 `computeCostPerWear`（价格÷次数向下取整，无效返 null），保证全应用一致。
 *
 * 指标口径（与任务卡「每个指标定义窗口、分母、时区、归档处理和缺失价格处理」对齐）：
 * - 窗口：默认全量历史；月度报告按 wear_logs.date 的 YYYY-MM 分组。
 * - 时区：date 是当地日期字面量（YYYY-MM-DD，与 plans/trips 同语义），按字面量分组，
 *   不做 epoch 时区转换 → 设备切换时区不偏移。
 * - 归档处理：归档衣物（archivedAt!=null，未删除）保留历史穿着贡献（计入总穿着次数/天数/盘活），
 *   但不进入「当前可穿库存」与「久未穿」列表。
 * - 墓碑处理：deletedAt!=null 的衣物不计入总数与盘活；其穿着记录在纯函数层按 validIds 过滤
 *   （装配层亦应过滤墓碑 items，双层防御）。
 * - 缺失价格：成本/次为 null，0 次不显示数值，绝不除零或 NaN。
 * - 重复率 = 穿过 ≥2 次的单品数 / 盘活单品数（盘活=穿过 ≥1 次）；盘活 0 时为 0。
 * - 学习期：wearDays < 7 视为数据不足，UI 显示学习期说明。
 */
import { computeCostPerWear } from '../wardrobe/stats';

const DAY_MS = 86_400_000;

/** 一次实际穿着事实（来自 wear_logs + wear_log_items 装配）。 */
export interface WearLogFact {
  id: string;
  /** YYYY-MM-DD 当地日期字面量（与 wear_logs.date 同语义）。 */
  date: string;
  /** 记录时间 epoch ms（用于 lastWornAt / daysSinceLastWorn）。 */
  createdAt: number;
  /** 该次穿着的衣物 id 列表（来自 wear_log_items，去重后）。 */
  garmentIds: string[];
}

/** 衣物事实（来自 garments 行的纯数据投影）。 */
export interface GarmentFact {
  id: string;
  category: string;
  /** 购买价（分）；null 表示未填。 */
  priceMinor: number | null;
  /** YYYY-MM-DD 购买日期字面量；null 表示未填。 */
  purchaseDate: string | null;
  /** 归档时间 epoch ms；null 表示未归档。 */
  archivedAt: number | null;
  /** 墓碑时间 epoch ms；null 表示未删除。 */
  deletedAt: number | null;
  createdAt: number;
}

export interface WardrobeOverview {
  /** 未删除衣物总数。 */
  totalGarments: number;
  /** 未删除未归档（当前可穿库存）。 */
  activeGarments: number;
  /** 未删除已归档。 */
  archivedGarments: number;
  /** distinct wear_logs.date（穿过天数，仅含有效衣物穿着）。 */
  wearDays: number;
  /** 有效穿着记录条数（至少穿了一件未删除衣物）。 */
  totalWears: number;
  /** 穿过 ≥1 次的未删除单品数（盘活单品）。 */
  activatedGarments: number;
  /** 穿过 ≥2 次单品数 / 盘活单品数；盘活 0 时为 0。 */
  repeatRate: number;
  /** totalWears / activatedGarments；盘活 0 时为 0。 */
  avgWearsPerActivated: number;
  /** wearDays < LEARNING_PERIOD_DAYS。 */
  isLearningPeriod: boolean;
}

export type IdleThreshold = 30 | 60 | 90;

export interface IdleGarment {
  garmentId: string;
  lastWornAt: number | null;
  /** floor((now - lastWornAt)/DAY)；从未穿过为 null。 */
  daysSinceLastWorn: number | null;
  /** newUnworn=录入后从未穿过；idle=穿过过但长期未穿。 */
  kind: 'newUnworn' | 'idle';
  /** 命中的久未穿阈值分桶；newUnworn 为 null。idle30=30≤d<60, idle60=60≤d<90, idle90=d≥90。 */
  idleThreshold: IdleThreshold | null;
}

export interface IdleReport {
  /** 录入后从未穿过的未归档未删除衣物。 */
  newUnworn: IdleGarment[];
  /** 30≤days<60。 */
  idle30: IdleGarment[];
  /** 60≤days<90。 */
  idle60: IdleGarment[];
  /** ≥90。 */
  idle90: IdleGarment[];
}

export interface GarmentCostRow {
  garmentId: string;
  category: string;
  priceMinor: number | null;
  timesWorn: number;
  /** 价格÷次数向下取整到分；价格≤0 或次数=0 为 null。 */
  costPerWearMinor: number | null;
  archived: boolean;
}

export interface MonthlyReport {
  /** YYYY-MM。 */
  yearMonth: string;
  wearDays: number;
  totalWears: number;
  activatedGarments: number;
  /** 当月首次穿上的单品数（该件衣物所有 wear_logs 中最早 date 落在当月）。 */
  newActivatedGarments: number;
}

/** 脱敏分享快照：不含原图路径、备注、价格、定位、单品 id/名称等受保护字段。 */
export interface ShareableReport {
  generatedAt: number;
  window: { yearMonth: string };
  overview: Pick<
    WardrobeOverview,
    'totalGarments' | 'activeGarments' | 'archivedGarments' | 'wearDays' | 'totalWears' | 'activatedGarments' | 'repeatRate' | 'avgWearsPerActivated'
  >;
  monthly: Pick<MonthlyReport, 'wearDays' | 'totalWears' | 'activatedGarments' | 'newActivatedGarments'>;
}

export const LEARNING_PERIOD_DAYS = 7;
export const IDLE_THRESHOLDS: readonly IdleThreshold[] = [30, 60, 90];
/** 受保护字段名（脱敏校验用）。 */
export const PROTECTED_FIELD_KEYS = [
  'price',
  'note',
  'path',
  'location',
  'city',
  'originalrel',
  'latitude',
  'longitude',
  'purchasedate',
] as const;

interface WearAgg {
  timesWorn: number;
  lastWornAt: number | null;
}

/** 未删除衣物 id 集合（归档算未删除，保留历史贡献）。 */
function buildValidIdSet(garments: GarmentFact[]): Set<string> {
  const s = new Set<string>();
  for (const g of garments) {
    if (g.deletedAt == null) s.add(g.id);
  }
  return s;
}

/** 一条穿着中的有效衣物 id（去重 + 过滤墓碑）。 */
function effectiveGarmentIds(w: WearLogFact, validIds: Set<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of w.garmentIds) {
    if (validIds.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** 按 garmentId 聚合穿着次数与最近穿着时间（仅有效衣物）。 */
function aggregateWear(wearLogs: WearLogFact[], validIds: Set<string>): Map<string, WearAgg> {
  const m = new Map<string, WearAgg>();
  for (const w of wearLogs) {
    const ids = effectiveGarmentIds(w, validIds);
    for (const id of ids) {
      const cur = m.get(id) ?? { timesWorn: 0, lastWornAt: null };
      cur.timesWorn += 1;
      if (cur.lastWornAt == null || w.createdAt > cur.lastWornAt) {
        cur.lastWornAt = w.createdAt;
      }
      m.set(id, cur);
    }
  }
  return m;
}

function byIdStable<T extends { garmentId: string }>(a: T, b: T): number {
  return a.garmentId < b.garmentId ? -1 : a.garmentId > b.garmentId ? 1 : 0;
}

export function computeWardrobeOverview(
  wearLogs: WearLogFact[],
  garments: GarmentFact[],
  now: number,
): WardrobeOverview {
  void now; // 总览不依赖 now（久未穿才依赖）
  const validIds = buildValidIdSet(garments);
  const agg = aggregateWear(wearLogs, validIds);

  let totalGarments = 0;
  let activeGarments = 0;
  let archivedGarments = 0;
  let activatedGarments = 0;
  let repeatedGarments = 0;
  for (const g of garments) {
    if (g.deletedAt != null) continue;
    totalGarments += 1;
    if (g.archivedAt != null) {
      archivedGarments += 1;
    } else {
      activeGarments += 1;
    }
    const a = agg.get(g.id);
    if (a && a.timesWorn >= 1) {
      activatedGarments += 1;
      if (a.timesWorn >= 2) repeatedGarments += 1;
    }
  }

  // 有效穿着记录：至少穿了一件未删除衣物
  const effectiveLogs = wearLogs.filter((w) => effectiveGarmentIds(w, validIds).length > 0);
  const wearDays = new Set(effectiveLogs.map((w) => w.date)).size;
  const totalWears = effectiveLogs.length;

  const repeatRate = activatedGarments > 0 ? repeatedGarments / activatedGarments : 0;
  const avgWearsPerActivated = activatedGarments > 0 ? totalWears / activatedGarments : 0;

  return {
    totalGarments,
    activeGarments,
    archivedGarments,
    wearDays,
    totalWears,
    activatedGarments,
    repeatRate,
    avgWearsPerActivated,
    isLearningPeriod: wearDays < LEARNING_PERIOD_DAYS,
  };
}

export function computeIdleReport(
  wearLogs: WearLogFact[],
  garments: GarmentFact[],
  now: number,
): IdleReport {
  const validIds = buildValidIdSet(garments);
  const agg = aggregateWear(wearLogs, validIds);

  const newUnworn: IdleGarment[] = [];
  const idle30: IdleGarment[] = [];
  const idle60: IdleGarment[] = [];
  const idle90: IdleGarment[] = [];

  for (const g of garments) {
    if (g.deletedAt != null) continue; // 墓碑不计入
    if (g.archivedAt != null) continue; // 归档不进久未穿（不在当前可穿库存）
    const a = agg.get(g.id);
    const timesWorn = a?.timesWorn ?? 0;
    const lastWornAt = a?.lastWornAt ?? null;

    if (timesWorn === 0) {
      // 录入后从未穿过（新录入未穿，与长期未穿分开）
      newUnworn.push({
        garmentId: g.id,
        lastWornAt: null,
        daysSinceLastWorn: null,
        kind: 'newUnworn',
        idleThreshold: null,
      });
      continue;
    }

    // timesWorn ≥ 1：长期未穿判定
    const days = Math.floor((now - (lastWornAt as number)) / DAY_MS);
    if (days < 30) continue; // 近期穿过，不在久未穿
    const threshold: IdleThreshold = days < 60 ? 30 : days < 90 ? 60 : 90;
    const item: IdleGarment = {
      garmentId: g.id,
      lastWornAt,
      daysSinceLastWorn: days,
      kind: 'idle',
      idleThreshold: threshold,
    };
    if (threshold === 30) idle30.push(item);
    else if (threshold === 60) idle60.push(item);
    else idle90.push(item);
  }

  newUnworn.sort(byIdStable);
  idle30.sort(byIdStable);
  idle60.sort(byIdStable);
  idle90.sort(byIdStable);
  return { newUnworn, idle30, idle60, idle90 };
}

/** 按成本/次升序（最划算在前），null 排后；同 costPerWear 按 garmentId 稳定。 */
export function computeCostPerWearList(
  wearLogs: WearLogFact[],
  garments: GarmentFact[],
): GarmentCostRow[] {
  const validIds = buildValidIdSet(garments);
  const agg = aggregateWear(wearLogs, validIds);

  const rows: GarmentCostRow[] = garments
    .filter((g) => g.deletedAt == null)
    .map((g) => {
      const timesWorn = agg.get(g.id)?.timesWorn ?? 0;
      return {
        garmentId: g.id,
        category: g.category,
        priceMinor: g.priceMinor,
        timesWorn,
        costPerWearMinor: computeCostPerWear(g.priceMinor, timesWorn),
        archived: g.archivedAt != null,
      };
    });

  rows.sort((a, b) => {
    const av = a.costPerWearMinor;
    const bv = b.costPerWearMinor;
    if (av == null && bv == null) return byIdStable(a, b);
    if (av == null) return 1; // null 排后
    if (bv == null) return -1;
    if (av !== bv) return av - bv; // 升序，最划算在前
    return byIdStable(a, b);
  });
  return rows;
}

export function computeMonthlyReport(wearLogs: WearLogFact[], yearMonth: string): MonthlyReport {
  const inMonth = wearLogs.filter((w) => w.date.startsWith(yearMonth));
  const wearDays = new Set(inMonth.map((w) => w.date)).size;
  const totalWears = inMonth.length;

  const activatedSet = new Set<string>();
  for (const w of inMonth) {
    for (const id of w.garmentIds) activatedSet.add(id);
  }
  const activatedGarments = activatedSet.size;

  // 当月首次穿上：该件衣物所有 wear_logs 中最早 date 落在当月
  const earliestByGarment = new Map<string, string>();
  for (const w of wearLogs) {
    for (const id of w.garmentIds) {
      const cur = earliestByGarment.get(id);
      if (cur == null || w.date < cur) earliestByGarment.set(id, w.date);
    }
  }
  let newActivatedGarments = 0;
  for (const id of activatedSet) {
    const earliest = earliestByGarment.get(id);
    if (earliest != null && earliest.startsWith(yearMonth)) {
      newActivatedGarments += 1;
    }
  }

  return { yearMonth, wearDays, totalWears, activatedGarments, newActivatedGarments };
}

export function buildShareableReport(
  overview: WardrobeOverview,
  monthly: MonthlyReport,
  now: number,
): ShareableReport {
  return {
    generatedAt: now,
    window: { yearMonth: monthly.yearMonth },
    overview: {
      totalGarments: overview.totalGarments,
      activeGarments: overview.activeGarments,
      archivedGarments: overview.archivedGarments,
      wearDays: overview.wearDays,
      totalWears: overview.totalWears,
      activatedGarments: overview.activatedGarments,
      repeatRate: overview.repeatRate,
      avgWearsPerActivated: overview.avgWearsPerActivated,
    },
    monthly: {
      wearDays: monthly.wearDays,
      totalWears: monthly.totalWears,
      activatedGarments: monthly.activatedGarments,
      newActivatedGarments: monthly.newActivatedGarments,
    },
  };
}

/** 校验分享产物是否泄漏受保护字段（key 名小写匹配）。泄漏返回 true。 */
export function hasProtectedLeak(report: ShareableReport): boolean {
  const json = JSON.stringify(report).toLowerCase();
  return PROTECTED_FIELD_KEYS.some((k) => json.includes(`"${k}`));
}
