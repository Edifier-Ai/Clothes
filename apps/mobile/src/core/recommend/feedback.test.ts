/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { openQueueTestDb } from '../db/queueTestHelper';
import { buildFeedbackWeights, listFeedback, recordFeedback } from './feedback';

describe('推荐反馈', () => {
  it('同一幂等键重试只保存一次，并完整记录替换前后、槽位、原因和模式', async () => {
    const t = openQueueTestDb();
    const input = {
      idempotencyKey: 'rec-1:replace:top:t1:t2',
      recommendationId: 'rec-1',
      eventType: 'replace' as const,
      slot: 'top' as const,
      beforeItemId: 't1',
      afterItemId: 't2',
      skipReason: '想换个颜色',
      mode: 'fresh' as const,
      createdAt: 123,
    };
    expect((await recordFeedback(t.db, input)).inserted).toBe(true);
    expect((await recordFeedback(t.db, input)).inserted).toBe(false);

    const rows = await listFeedback(t.db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      recommendationId: 'rec-1',
      eventType: 'replace',
      slot: 'top',
      beforeItemId: 't1',
      afterItemId: 't2',
      skipReason: '想换个颜色',
      mode: 'fresh',
    });
    t.close();
  });

  it('接受与替换反馈形成可用于后续推荐的软权重', async () => {
    const t = openQueueTestDb();
    await recordFeedback(t.db, {
      idempotencyKey: 'replace-1',
      recommendationId: 'rec-1',
      eventType: 'replace',
      slot: 'top',
      beforeItemId: 't1',
      afterItemId: 't2',
      skipReason: null,
      mode: 'fresh',
      createdAt: 1,
    });
    await recordFeedback(t.db, {
      idempotencyKey: 'accept-1',
      recommendationId: 'rec-2',
      eventType: 'accept',
      slot: null,
      beforeItemId: null,
      afterItemId: 't2',
      skipReason: null,
      mode: 'safe',
      createdAt: 2,
    });
    const weights = buildFeedbackWeights(await listFeedback(t.db));
    expect(weights.get('t2')).toBeGreaterThan(0);
    expect(weights.get('t1')).toBeLessThan(0);
    t.close();
  });
});
