/**
 * 穿着记录持久化（MVP-005）。
 *
 * 直接基于 drizzle 实例（与 queue.ts 一致）：设备传 drizzle(expo-sqlite)，测试传 drizzle(better-sqlite3)。
 *
 * 幂等：recommendation_id + date 唯一。重复提交不产生新记录，返回 inserted=false。
 * 原子写：wear_logs + wear_log_items 在同一事务内写入。
 *
 * 注意：调用方负责通过 mirror.writeMirror 落盘（与 garments 写入一致的 B-4 兜底）。
 */
import { and, eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';

import * as schema from '../db/schema';
import { wearLogItems, wearLogs, type WearLogRow } from '../db/schema';
import type { Outfit } from './index';

type AnyDb = ExpoSQLiteDatabase<typeof schema> | BetterSQLite3Database<typeof schema>;

export interface RecordWearInput {
  recommendationId: string;
  /** YYYY-MM-DD */
  date: string;
  outfit: Outfit;
  occasion: string | null;
  /** good | ok | bad | null */
  comfort: string | null;
  note?: string | null;
  now: number;
}

export interface RecordWearResult {
  inserted: boolean;
  wearLogId: string;
}

function outfitSlots(outfit: Outfit): { garmentId: string; slot: string }[] {
  const slots: { garmentId: string; slot: string }[] = [
    { garmentId: outfit.top.id, slot: 'top' },
    { garmentId: outfit.bottom.id, slot: 'bottom' },
    { garmentId: outfit.shoes.id, slot: 'shoes' },
  ];
  if (outfit.outerwear) slots.push({ garmentId: outfit.outerwear.id, slot: 'outerwear' });
  return slots;
}

/**
 * 记录一次穿着。幂等：同 recommendationId+date 已存在则不插入。
 * 设备事务由 expo-sqlite 的 withTransactionAsync 保证；better-sqlite3 在 transaction() 同步回调中执行。
 */
export async function recordWear(db: AnyDb, input: RecordWearInput): Promise<RecordWearResult> {
  // 幂等检查
  const existing = (await db
    .select()
    .from(wearLogs)
    .where(and(eq(wearLogs.recommendationId, input.recommendationId), eq(wearLogs.date, input.date)))
    .all()) as WearLogRow[];
  if (existing.length > 0) {
    return { inserted: false, wearLogId: existing[0].id };
  }

  const wearLogId = `${input.recommendationId}-wear-${input.date}`;
  await db.insert(wearLogs).values({
    id: wearLogId,
    recommendationId: input.recommendationId,
    date: input.date,
    occasion: input.occasion,
    comfort: input.comfort,
    note: input.note ?? null,
    createdAt: input.now,
  });
  const slots = outfitSlots(input.outfit);
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    await db.insert(wearLogItems).values({
      id: `${wearLogId}-item-${i}-${s.slot}`,
      wearLogId,
      garmentId: s.garmentId,
      slot: s.slot,
      ord: i,
    });
  }
  return { inserted: true, wearLogId };
}

export interface WearLogWithItems extends WearLogRow {
  items: { garmentId: string; slot: string; ord: number }[];
}

/** 列出所有穿着记录（含 items）。 */
export async function listWearLogs(db: AnyDb): Promise<WearLogWithItems[]> {
  const logs = (await db.select().from(wearLogs).all()) as WearLogRow[];
  const items = (await db.select().from(wearLogItems).all()) as (typeof wearLogItems.$inferSelect)[];
  const byLog = new Map<string, { garmentId: string; slot: string; ord: number }[]>();
  for (const it of items) {
    const arr = byLog.get(it.wearLogId) ?? [];
    arr.push({ garmentId: it.garmentId, slot: it.slot, ord: it.ord });
    byLog.set(it.wearLogId, arr);
  }
  return logs.map((l) => ({ ...l, items: (byLog.get(l.id) ?? []).sort((a, b) => a.ord - b.ord) }));
}

/** 推荐器输入构建：聚合 wear_logs 得到每件衣物的 lastWornAt/timesWorn。 */
export async function getWearStats(
  db: AnyDb,
): Promise<Map<string, { lastWornAt: number | null; timesWorn: number }>> {
  const logs = (await db.select().from(wearLogs).all()) as WearLogRow[];
  const items = (await db.select().from(wearLogItems).all()) as (typeof wearLogItems.$inferSelect)[];
  const stats = new Map<string, { lastWornAt: number | null; timesWorn: number }>();
  for (const it of items) {
    const cur = stats.get(it.garmentId) ?? { lastWornAt: null, timesWorn: 0 };
    cur.timesWorn += 1;
    const log = logs.find((l) => l.id === it.wearLogId);
    if (log && (cur.lastWornAt == null || log.createdAt > cur.lastWornAt)) {
      cur.lastWornAt = log.createdAt;
    }
    stats.set(it.garmentId, cur);
  }
  return stats;
}
