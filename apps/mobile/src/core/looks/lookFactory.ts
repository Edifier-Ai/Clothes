import type { LookItemRow, LookRow, LookSlot } from '../db/schema';

/**
 * 变体与克隆工厂（MVP-008 LOK-06）。纯函数，不修改输入：
 * - createVariant：只替换指定单品（按 garmentId 或 slot 定位），
 *   其余 items 的几何/层级原样拷贝；新造型 source_look_id = 原造型 id。
 * - cloneLook：全量拷贝，source_look_id = NULL（克隆不保留变体关联）。
 * id 与时间戳由调用方注入（uuidv7 / Date.now），保证可测与确定性。
 */

export interface FactoryDeps {
  newId: () => string;
  now: number;
}

export interface VariantChange {
  /** 二选一定位目标单品；都提供时优先 garmentId。 */
  garmentId?: string;
  slot?: LookSlot;
  newGarmentId: string;
}

export interface DerivedLook {
  look: LookRow;
  items: LookItemRow[];
}

function copyItems(
  source: readonly LookItemRow[],
  lookId: string,
  newId: () => string,
  replace: (item: LookItemRow) => string,
): LookItemRow[] {
  return source.map((it) => ({
    ...it,
    id: newId(),
    lookId,
    garmentId: replace(it),
  }));
}

/** 从原造型派生变体：只换指定单品，其余原样。找不到目标抛错（不伪造变体）。 */
export function createVariant(
  look: LookRow,
  items: readonly LookItemRow[],
  change: VariantChange,
  deps: FactoryDeps,
): DerivedLook {
  const target = change.garmentId != null
    ? items.find((i) => i.garmentId === change.garmentId)
    : change.slot != null
      ? items.find((i) => i.slot === change.slot)
      : undefined;
  if (!target) {
    throw new Error(
      `variant target not found: garmentId=${change.garmentId ?? '-'} slot=${change.slot ?? '-'}`,
    );
  }
  const newLookId = deps.newId();
  return {
    look: {
      id: newLookId,
      name: look.name,
      mode: look.mode,
      sourceLookId: look.id,
      coverRelPath: null, // 派生封面按新组合重建
      createdAt: deps.now,
      updatedAt: deps.now,
      deletedAt: null,
    },
    items: copyItems(items, newLookId, deps.newId, (it) =>
      it.id === target.id ? change.newGarmentId : it.garmentId,
    ),
  };
}

/** 克隆造型：全量拷贝（几何/层级/单品一致），source_look_id 为 NULL。 */
export function cloneLook(
  look: LookRow,
  items: readonly LookItemRow[],
  deps: FactoryDeps,
): DerivedLook {
  const newLookId = deps.newId();
  return {
    look: {
      id: newLookId,
      name: look.name,
      mode: look.mode,
      sourceLookId: null,
      coverRelPath: null,
      createdAt: deps.now,
      updatedAt: deps.now,
      deletedAt: null,
    },
    items: copyItems(items, newLookId, deps.newId, (it) => it.garmentId),
  };
}
