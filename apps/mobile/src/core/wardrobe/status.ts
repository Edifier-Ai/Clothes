import type { GarmentDb, GarmentDbOps } from '../db/dao';
import type { GarmentStatus, GarmentStatusEventRow } from '../db/schema';
import { uuidv7 } from '../id/uuidv7';

/**
 * 衣物状态机与历史（MVP-007 CLS-05）。
 *
 * - 状态：clean（干净）/ laundry（待洗）/ dryclean（干洗）/ loaned（借出），
 *   另有历史遗留 worn / wishlist 仅作数据兼容，不作为流转目标。
 * - 归档由 archivedAt 表达（与状态正交）：归档记 to_status='archived'，恢复记 'restored'。
 * - 每次真实变化追加 garment_status_events（含时间戳）；相同状态/重复归档不写事件。
 * - 归档衣物不能直接改状态，须先恢复（UI 上归档区只提供「恢复」）。
 */

export type CareStatus = 'clean' | 'laundry' | 'dryclean' | 'loaned';

export interface StatusChangeResult {
  changed: boolean;
  from: string | null;
}

function event(garmentId: string, fromStatus: string | null, toStatus: string, changedAt: number): GarmentStatusEventRow {
  return { id: uuidv7(), garmentId, fromStatus, toStatus, changedAt };
}

/** 事务内共用实现：校验存在/未删除，按需写状态+事件。返回 false 表示无变化。 */
async function applyStatusTx(
  tx: GarmentDbOps,
  id: string,
  to: CareStatus,
  now: number,
): Promise<{ changed: boolean; from: string | null }> {
  const row = await tx.getActiveGarment(id);
  if (!row) throw new Error(`garment not found or deleted: ${id}`);
  if (row.archivedAt != null) throw new Error(`garment archived, restore first: ${id}`);
  if (row.status === to) return { changed: false, from: row.status };
  await tx.updateGarment(id, { status: to, updatedAt: now });
  await tx.insertStatusEvent(event(id, row.status, to, now));
  return { changed: true, from: row.status };
}

export async function changeGarmentStatus(
  db: GarmentDb,
  id: string,
  to: CareStatus,
  now: number,
): Promise<StatusChangeResult> {
  return db.transaction((tx) => applyStatusTx(tx, id, to, now));
}

export async function archiveGarment(
  db: GarmentDb,
  id: string,
  now: number,
): Promise<StatusChangeResult> {
  return db.transaction(async (tx) => {
    const row = await tx.getActiveGarment(id);
    if (!row) throw new Error(`garment not found or deleted: ${id}`);
    if (row.archivedAt != null) return { changed: false, from: row.status };
    await tx.updateGarment(id, { archivedAt: now, updatedAt: now });
    await tx.insertStatusEvent(event(id, row.status, 'archived', now));
    return { changed: true, from: row.status };
  });
}

export async function unarchiveGarment(
  db: GarmentDb,
  id: string,
  now: number,
): Promise<StatusChangeResult> {
  return db.transaction(async (tx) => {
    const row = await tx.getActiveGarment(id);
    if (!row) throw new Error(`garment not found or deleted: ${id}`);
    if (row.archivedAt == null) return { changed: false, from: 'active' };
    await tx.updateGarment(id, { archivedAt: null, updatedAt: now });
    await tx.insertStatusEvent(event(id, 'archived', 'restored', now));
    return { changed: true, from: 'archived' };
  });
}

/** 某衣物的状态历史（时间升序）。 */
export async function listGarmentStatusEvents(db: GarmentDb, id: string): Promise<GarmentStatusEventRow[]> {
  return db.listStatusEventsByGarment(id);
}

/** TDY-07 穿后洗护：'skip' 不写库不记事件；任一衣物不存在则整体回滚。 */
export type PostWearAction = CareStatus | 'skip';

export interface PostWearResult {
  updatedIds: string[];
  skippedIds: string[];
}

export async function applyPostWearCare(
  db: GarmentDb,
  decisions: readonly { garmentId: string; action: PostWearAction }[],
  now: number,
): Promise<PostWearResult> {
  return db.transaction(async (tx) => {
    // 先全量校验再写入：任何一件不存在即抛错，事务回滚，无半成品。
    for (const d of decisions) {
      if (d.action === 'skip') continue;
      const row = await tx.getActiveGarment(d.garmentId);
      if (!row) throw new Error(`garment not found or deleted: ${d.garmentId}`);
    }
    const updatedIds: string[] = [];
    const skippedIds: string[] = [];
    for (const d of decisions) {
      if (d.action === 'skip') {
        skippedIds.push(d.garmentId);
        continue;
      }
      await applyStatusTx(tx, d.garmentId, d.action, now);
      updatedIds.push(d.garmentId);
    }
    return { updatedIds, skippedIds };
  });
}

export type { GarmentStatus };
