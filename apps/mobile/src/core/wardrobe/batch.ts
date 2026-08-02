import type { GarmentDb, GarmentDbOps, TagInput } from '../db/dao';
import { uuidv7 } from '../id/uuidv7';
import type { CareStatus } from './status';

/**
 * 批量操作（MVP-007 CLS-07）：状态 / 归档 / 加标签在同一事务内完成。
 * 任一衣物不存在即抛 BatchApplyError，事务整体回滚——不存在「半数衣物被改」。
 */

export class BatchApplyError extends Error {
  constructor(public readonly garmentId: string) {
    super(`batch apply failed: garment not found or deleted: ${garmentId}`);
    this.name = 'BatchApplyError';
  }
}

export interface BatchPatch {
  status?: CareStatus;
  /** true=归档，false=恢复 */
  archive?: boolean;
  /** 追加一条标签（不覆盖既有标签） */
  addTag?: TagInput;
}

export interface BatchResult {
  updated: number;
}

function statusEvent(garmentId: string, fromStatus: string | null, toStatus: string, changedAt: number) {
  return { id: uuidv7(), garmentId, fromStatus, toStatus, changedAt };
}

async function applyOne(
  tx: GarmentDbOps,
  id: string,
  patch: BatchPatch,
  now: number,
): Promise<boolean> {
  const row = await tx.getActiveGarment(id);
  if (!row) throw new BatchApplyError(id);
  let touched = false;
  if (patch.status !== undefined) {
    if (row.archivedAt != null) throw new BatchApplyError(id);
    if (row.status !== patch.status) {
      await tx.updateGarment(id, { status: patch.status, updatedAt: now });
      await tx.insertStatusEvent(statusEvent(id, row.status, patch.status, now));
      touched = true;
    }
  }
  if (patch.archive === true && row.archivedAt == null) {
    await tx.updateGarment(id, { archivedAt: now, updatedAt: now });
    await tx.insertStatusEvent(statusEvent(id, row.status, 'archived', now));
    touched = true;
  }
  if (patch.archive === false && row.archivedAt != null) {
    await tx.updateGarment(id, { archivedAt: null, updatedAt: now });
    await tx.insertStatusEvent(statusEvent(id, 'archived', 'restored', now));
    touched = true;
  }
  if (patch.addTag !== undefined) {
    await tx.insertTags([
      {
        id: `${id}-tag-b-${uuidv7()}`,
        garmentId: id,
        kind: patch.addTag.kind,
        value: patch.addTag.value,
        confidence: patch.addTag.confidence ?? 1,
      },
    ]);
    touched = true;
  }
  return touched;
}

export async function batchUpdateGarments(
  db: GarmentDb,
  ids: readonly string[],
  patch: BatchPatch,
  now: number,
): Promise<BatchResult> {
  return db.transaction(async (tx) => {
    // 先全量校验存在性，再统一写入：校验失败发生在任何写入之前。
    for (const id of ids) {
      const row = await tx.getActiveGarment(id);
      if (!row) throw new BatchApplyError(id);
    }
    let updated = 0;
    for (const id of ids) {
      if (await applyOne(tx, id, patch, now)) updated += 1;
    }
    return { updated };
  });
}
