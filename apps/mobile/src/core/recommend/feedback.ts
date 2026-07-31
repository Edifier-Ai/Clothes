import { desc } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';

import * as schema from '../db/schema';
import { feedbackEvents, type FeedbackEventRow } from '../db/schema';
import type { OutfitSlot, RecommendationMode } from './replacement';

type AnyDb =
  | BetterSQLite3Database<typeof schema>
  | ExpoSQLiteDatabase<typeof schema>;

export type FeedbackEventType = 'accept' | 'replace' | 'skip' | 'mode';

export interface FeedbackInput {
  idempotencyKey: string;
  recommendationId: string;
  eventType: FeedbackEventType;
  slot: OutfitSlot | null;
  beforeItemId: string | null;
  afterItemId: string | null;
  skipReason: string | null;
  mode: RecommendationMode;
  createdAt: number;
}

export async function recordFeedback(
  db: AnyDb,
  input: FeedbackInput,
): Promise<{ inserted: boolean }> {
  const result = await db
    .insert(feedbackEvents)
    .values({
      id: `feedback:${input.idempotencyKey}`,
      ...input,
    })
    .onConflictDoNothing({ target: feedbackEvents.idempotencyKey });
  const changes = (result as { changes?: number }).changes;
  return { inserted: changes == null ? true : changes > 0 };
}

export async function listFeedback(db: AnyDb): Promise<FeedbackEventRow[]> {
  return await db
    .select()
    .from(feedbackEvents)
    .orderBy(desc(feedbackEvents.createdAt)) as FeedbackEventRow[];
}

export function buildFeedbackWeights(events: readonly FeedbackEventRow[]): Map<string, number> {
  const weights = new Map<string, number>();
  const add = (id: string | null, value: number) => {
    if (!id) return;
    weights.set(id, (weights.get(id) ?? 0) + value);
  };
  for (const event of events) {
    if (event.eventType === 'replace') {
      add(event.beforeItemId, -2);
      add(event.afterItemId, 2);
    } else if (event.eventType === 'accept') {
      add(event.afterItemId, 3);
    } else if (event.eventType === 'skip') {
      add(event.beforeItemId, -1);
    }
  }
  return weights;
}
