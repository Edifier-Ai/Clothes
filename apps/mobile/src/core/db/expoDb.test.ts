/**
 * @jest-environment node
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { FakeExpoSQLiteDatabase as MockExpoDb } from './expoSqliteFake';

let mockDbFile = '';
const mockOpened: MockExpoDb[] = [];

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: async () => {
    const db = new MockExpoDb(mockDbFile);
    mockOpened.push(db);
    return db;
  },
}));

// eslint-disable-next-line import/first
import { closeAppDbForTest, openAppDb } from './expoDb';
// eslint-disable-next-line import/first
import { createGarment, dumpAll, listActiveGarments, replaceAll } from './dao';

function sample(id: string) {
  return {
    id,
    name: `衣物 ${id}`,
    category: 'top' as const,
    asset: {
      id: `${id}-asset`,
      originalRelPath: `originals/${id}.jpg`,
      sha256: `hash-${id}`,
      width: 100,
      height: 200,
      bytes: 1234,
      mimeType: 'image/jpeg',
    },
    tags: [{ kind: 'color' as const, value: 'white' }],
    now: 1_000,
  };
}

describe('expoDb 设备驱动事务语义', () => {
  beforeEach(() => {
    mockDbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'clothes-expo-')), 'clothes.db');
  });

  afterEach(async () => {
    await closeAppDbForTest();
    for (const db of mockOpened.splice(0)) await db.closeAsync();
  });

  it('事务中途失败时整体回滚：replaceAll 不会留下删了一半的数据', async () => {
    const app = await openAppDb();
    await createGarment(app.db, sample('a'));
    await createGarment(app.db, sample('b'));
    const good = await dumpAll(app.db);
    expect(good.garments).toHaveLength(2);

    // 重复主键：前面的 DELETE 已执行，插入第二件时失败。
    const broken = { ...good, garments: [good.garments[0], good.garments[0]] };
    await expect(replaceAll(app.db, broken)).rejects.toThrow();

    const after = await listActiveGarments(app.db);
    expect(after.map((g) => g.id).sort()).toEqual(['a', 'b']);
  });

  it('并发事务串行执行，不会出现嵌套 BEGIN', async () => {
    const app = await openAppDb();
    await Promise.all([createGarment(app.db, sample('x')), createGarment(app.db, sample('y'))]);
    const after = await listActiveGarments(app.db);
    expect(after.map((g) => g.id).sort()).toEqual(['x', 'y']);
  });

  it('withTransaction 与 GarmentDb.transaction 共用同一串行队列', async () => {
    const app = await openAppDb();
    await Promise.all([
      app.withTransaction(async () => {
        await app.raw.runAsync("INSERT INTO __clothes_meta(key,value) VALUES('probe','1')");
      }),
      createGarment(app.db, sample('z')),
    ]);
    expect(await app.db.getMeta('probe')).toBe('1');
    expect((await listActiveGarments(app.db)).map((g) => g.id)).toEqual(['z']);
  });
});

describe('expoDb meta 读写', () => {
  beforeEach(() => {
    mockDbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'clothes-expo-')), 'clothes.db');
  });

  afterEach(async () => {
    await closeAppDbForTest();
    for (const db of mockOpened.splice(0)) await db.closeAsync();
  });

  it('含单引号的值原样往返（参数绑定，不拼接 SQL）', async () => {
    const app = await openAppDb();
    await app.db.setMeta("note", "it's a 'quoted' value");
    expect(await app.db.getMeta('note')).toBe("it's a 'quoted' value");
    await app.db.setMetaInt('data_updated_at', 42);
    expect(await app.db.getMetaInt('data_updated_at')).toBe(42);
  });
});
