/**
 * 旅行打包纯函数（MVP-010）。
 *
 * 不接触持久层，只对内存里的造型安排与清单项做去重、来源计数、视图分组与汇总。
 * 这些纯函数被 packingService.regeneratePackingCore 与 UI 视图层共用：
 * - 服务层用 `computePackingFromOutfits` 算出 garment 项草稿，再与现有勾选手工项合并落库；
 * - UI 层用 `packingSummary`/`tripsByStatus` 渲染汇总与分组，无需重写一遍领域规则。
 *
 * 设计要点（与任务卡验收对齐）：
 * - 去重按 garmentId：同一件衣物在多套造型里只算一项，`sourceCount` = 被几套用到，
 *   `sourceOutfitIds` 保留来源（按造型出现顺序）。
 * - 墓碑造型（`deletedAt != null`）不参与计算，与 listActiveTripOutfitsCore 的过滤一致。
 * - 坏快照（非数组 / 坏 JSON）按空快照处理，不抛错——读取层已做同样容错，这里独立兜底。
 * - `missing` 由调用方（持久层查 garments 表）填充，纯函数只算几何事实。
 */

/** 造型安排的内存视图：服务层读取 tripOutfits 行 + 解析 outfit_json 后传入。 */
export interface TripOutfitView {
  id: string;
  tripId: string;
  date: string;
  timeLabel: string;
  /** 关联造型的单品快照；墓碑/坏 JSON 按空数组。 */
  outfitGarmentIds: readonly string[];
  /** 墓碑时间戳；null = 活动。 */
  deletedAt: number | null;
}

/** 打包清单 garment 项草稿（regenerate 用；落库前由 packingService 补 id/ord/checked）。 */
export interface PackingItemDraft {
  garmentId: string;
  sourceCount: number;
  sourceOutfitIds: string[];
}

/** 打包清单视图项（UI 汇总用）：garment 与 manual 共用，garmentId/missing 仅 garment 项有意义。 */
export interface PackingItemView {
  id: string;
  kind: 'garment' | 'manual';
  label: string;
  garmentId: string | null;
  checked: boolean;
  /** 勾选时间戳；未勾选为 null。汇总用对象可省略此字段。 */
  checkedAt?: number | null;
  sourceCount: number;
  sourceOutfitIds: string[];
  /** 仅 garment 项：引用衣物不存在/墓碑/归档 → true（行不删，UI 标缺失）。 */
  missing: boolean;
}

/** 旅行分组用最小视图。 */
export interface TripStatusView {
  id: string;
  status: 'planning' | 'ongoing' | 'completed' | 'archived';
  name: string;
}

/**
 * 从已安排造型去重计算打包清单 garment 项草稿。
 *
 * 规则：
 * 1. 排除墓碑造型（deletedAt != null）。
 * 2. 同一 garmentId 跨多套造型合并为一项，sourceCount = 出现套数，
 *    sourceOutfitIds 按造型出现顺序去重追加。
 * 3. outfitGarmentIds 内重复 id 同一套内只计一次（同一造型槽位不应重复，
 *    但快照可能脏，按集合去重）。
 *
 * 任务卡反向验证锚点：5 套同鞋 → 1 项 sourceCount=5；移除一套 → sourceCount=4。
 */
export function computePackingFromOutfits(outfits: readonly TripOutfitView[]): PackingItemDraft[] {
  const active = outfits.filter((o) => o.deletedAt == null);
  // garmentId → { count, outfitIds }
  const map = new Map<string, { sourceCount: number; sourceOutfitIds: string[] }>();
  for (const o of active) {
    // 同一套内 garmentId 去重（防御脏快照）
    const seen = new Set<string>();
    for (const gid of o.outfitGarmentIds) {
      if (seen.has(gid)) continue;
      seen.add(gid);
      let entry = map.get(gid);
      if (!entry) {
        entry = { sourceCount: 0, sourceOutfitIds: [] };
        map.set(gid, entry);
      }
      entry.sourceCount += 1;
      entry.sourceOutfitIds.push(o.id);
    }
  }
  return Array.from(map.entries()).map(([garmentId, v]) => ({
    garmentId,
    sourceCount: v.sourceCount,
    sourceOutfitIds: v.sourceOutfitIds,
  }));
}

/** 打包清单汇总（任务卡：总数/已勾选/未勾选/手工项数/缺失项数）。 */
export interface PackingSummary {
  total: number;
  checked: number;
  unchecked: number;
  manualCount: number;
  missingCount: number;
}

export function packingSummary(items: readonly PackingItemView[]): PackingSummary {
  let checked = 0;
  let manualCount = 0;
  let missingCount = 0;
  for (const it of items) {
    if (it.checked) checked += 1;
    if (it.kind === 'manual') manualCount += 1;
    if (it.missing) missingCount += 1;
  }
  return {
    total: items.length,
    checked,
    unchecked: items.length - checked,
    manualCount,
    missingCount,
  };
}

/** 旅行按状态分组（保持输入顺序）。 */
export interface TripsByStatus {
  planning: TripStatusView[];
  ongoing: TripStatusView[];
  completed: TripStatusView[];
  archived: TripStatusView[];
}

export function tripsByStatus(trips: readonly TripStatusView[]): TripsByStatus {
  const out: TripsByStatus = { planning: [], ongoing: [], completed: [], archived: [] };
  for (const t of trips) {
    out[t.status].push(t);
  }
  return out;
}
