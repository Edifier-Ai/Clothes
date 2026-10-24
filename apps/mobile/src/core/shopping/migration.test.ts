/** @jest-environment node */
import { describe, expect, it } from '@jest/globals';

import { createGarment } from '../db/dao';
import { runMigrations, SCHEMA_VERSION } from '../db/migrations';
import { openTestDbAtVersion } from '../db/sqliteTestHelper';

describe('shopping schema v9 migration', () => {
  it('v8 → v9 保留衣橱数据并创建无衣橱外键的候选表，重复运行幂等', async () => {
    const testDb = await openTestDbAtVersion(8);
    await createGarment(testDb.db, {
      id: 'g1',
      name: '旧衣橱衬衫',
      category: 'top',
      asset: {
        id: 'g1-asset',
        originalRelPath: 'originals/g1.jpg',
        sha256: 'sha-g1',
        width: 100,
        height: 200,
        bytes: 1_000,
        mimeType: 'image/jpeg',
      },
      now: 1_000,
    });

    const result = await runMigrations(testDb.adapter);
    expect(result).toEqual({ from: 8, to: SCHEMA_VERSION });
    expect(SCHEMA_VERSION).toBe(9);
    expect((await testDb.db.getGarment('g1'))?.name).toBe('旧衣橱衬衫');
    const foreignKeys = testDb.raw.prepare("PRAGMA foreign_key_list('shopping_candidates')").all();
    expect(foreignKeys).toEqual([]);

    testDb.raw.prepare(`
      INSERT INTO shopping_candidates (
        id,name,category,algorithm_version,results_json,compatibility_json,assumed_wears,
        verdict,analysis_state,created_at,updated_at
      ) VALUES ('s1','候选','top','shopping-image-v1','[]','[]',30,'undecided','insufficient_evidence',2,2)
    `).run();
    testDb.raw.prepare("DELETE FROM shopping_candidates WHERE id='s1'").run();
    // 候选删除不可能级联衣橱。
    expect((await testDb.db.getGarment('g1'))?.name).toBe('旧衣橱衬衫');

    expect(await runMigrations(testDb.adapter)).toEqual({ from: 9, to: 9 });
    testDb.close();
  });
});
