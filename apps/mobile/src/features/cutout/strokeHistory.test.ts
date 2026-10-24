/** @jest-environment node */
import { describe, expect, it } from '@jest/globals';

import { garments } from '@/core/db/schema';
import { appendStroke, listStrokes } from '@/core/db/queue';
import { openQueueTestDb } from '@/core/db/queueTestHelper';
import { redoStroke, StrokeRedoHistory, undoStroke } from './strokeHistory';

describe('修边撤销与重做', () => {
  it('undo/redo 原样持久化；撤销后新笔画清空 redo 分支', async () => {
    const t = openQueueTestDb();
    await t.db.insert(garments).values({
      id: 'garment-1',
      name: '测试衣物',
      category: 'top',
      status: 'clean',
      priceMinor: null,
      currency: null,
      purchaseDate: null,
      archivedAt: null,
      deletedAt: null,
      createdAt: 1,
      updatedAt: 1,
    });
    const mk = (id: string, ord: number) => ({
      id,
      garmentId: 'garment-1',
      op: 'erase' as const,
      pointsJson: `[${ord / 10},0.5]`,
      brushSize: 8,
      ord,
      createdAt: ord + 1,
    });
    await appendStroke(t.db, mk('stroke-0', 0));
    await appendStroke(t.db, mk('stroke-1', 1));
    const history = new StrokeRedoHistory();

    expect((await undoStroke(t.db, 'garment-1', history))?.id).toBe('stroke-1');
    expect(history.count).toBe(1);
    expect((await listStrokes(t.db, 'garment-1')).map((row) => row.id)).toEqual(['stroke-0']);

    expect((await redoStroke(t.db, history))?.id).toBe('stroke-1');
    expect(history.count).toBe(0);
    expect((await listStrokes(t.db, 'garment-1')).map((row) => row.id)).toEqual(['stroke-0', 'stroke-1']);

    await undoStroke(t.db, 'garment-1', history);
    expect(history.count).toBe(1);
    history.clearForNewStroke();
    await appendStroke(t.db, mk('stroke-new', 1));
    expect(await redoStroke(t.db, history)).toBeNull();
    expect((await listStrokes(t.db, 'garment-1')).map((row) => row.id)).toEqual(['stroke-0', 'stroke-new']);
    t.close();
  });
});
