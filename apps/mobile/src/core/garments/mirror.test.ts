/**
 * @jest-environment node
 *
 * MVP-009 镜像 v7 测试：
 * - writeMirror 写 version 7，looks/lookItems/plans 随 GarmentDump 落盘；
 * - 重启（新库）从镜像回灌造型，reopenDb 后一致；
 * - v5 旧镜像（无 looks 字段）兼容恢复，按空处理。
 *
 * expo-file-system 用内存实现（平台外壳，非被测核心）；DB 为真实 better-sqlite3。
 */
import { describe, expect, it, jest } from '@jest/globals';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';

import { createGarment, createLook, dumpAll } from '../db/dao';
import type * as schema from '../db/schema';
import { openTestDb, reopenDb } from '../db/sqliteTestHelper';
// jest.mock 会被提升到模块顶层，mirror 内的 expo-file-system 引用即内存实现
import { readMirror, restoreFromMirrorIfNeeded, writeMirror } from './mirror';

const mockFiles = new Map<string, string>();

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///mock/',
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
  makeDirectoryAsync: jest.fn(async () => {}),
  getInfoAsync: jest.fn(async (p: string) =>
    mockFiles.has(p) ? { exists: true, size: mockFiles.get(p)!.length } : { exists: false },
  ),
  readAsStringAsync: jest.fn(async (p: string) => mockFiles.get(p) ?? ''),
  writeAsStringAsync: jest.fn(async (p: string, content: string) => {
    mockFiles.set(p, content);
  }),
}));

const ROOT = 'file:///mock/clothes';
const MIRROR_PATH = `${ROOT}/garments_mirror.json`;

function drizzleAsExpo(t: { drizzleDb: unknown }): ExpoSQLiteDatabase<typeof schema> {
  return t.drizzleDb as ExpoSQLiteDatabase<typeof schema>;
}

async function seed(db: import('../db/dao').GarmentDb) {
  await createGarment(db, {
    id: 'g1',
    name: '白衬衫',
    category: 'top',
    asset: {
      id: 'g1-asset',
      originalRelPath: 'originals/g1.jpg',
      sha256: 'h1',
      width: 100,
      height: 200,
      bytes: 1234,
      mimeType: 'image/jpeg',
    },
    now: 1_000,
  });
  await createLook(db, {
    id: 'l1',
    name: '通勤造型',
    mode: 'slots',
    items: [
      { id: 'l1-i1', garmentId: 'g1', slot: 'top', x: 0.5, y: 0.3, scale: 1, rotation: 0, zIndex: 0, ord: 0 },
    ],
    now: 2_000,
  });
}

describe('镜像 v8', () => {
  it('writeMirror 写 version 8 且包含 looks/lookItems/plans/trips/tripOutfits/packingItems/tripTemplates', async () => {
    mockFiles.clear();
    const a = await openTestDb();
    await seed(a.db);
    await writeMirror(ROOT, a.db, drizzleAsExpo(a), 5_000);

    const raw = JSON.parse(mockFiles.get(MIRROR_PATH)!) as Record<string, unknown>;
    expect(raw.version).toBe(8);
    expect(Array.isArray(raw.looks)).toBe(true);
    expect((raw.looks as unknown[]).length).toBe(1);
    expect((raw.lookItems as unknown[]).length).toBe(1);
    expect(Array.isArray(raw.plans)).toBe(true);
    // v8 新增四表字段（随 GarmentDump 落盘，空数组）
    expect(Array.isArray(raw.trips)).toBe(true);
    expect(Array.isArray(raw.tripOutfits)).toBe(true);
    expect(Array.isArray(raw.packingItems)).toBe(true);
    expect(Array.isArray(raw.tripTemplates)).toBe(true);
    a.close();
  });

  it('新库从镜像回灌：造型与衣物完整恢复，reopenDb 后一致', async () => {
    mockFiles.clear();
    const a = await openTestDb();
    await seed(a.db);
    await writeMirror(ROOT, a.db, drizzleAsExpo(a), 9_000);
    a.close();

    // 模拟进程重启后的全新空库
    const b = await openTestDb();
    const restored = await restoreFromMirrorIfNeeded(ROOT, b.db, drizzleAsExpo(b));
    expect(restored).toBe(true);
    const dump = await dumpAll(b.db);
    expect(dump.looks?.map((l) => l.id)).toEqual(['l1']);
    expect(dump.lookItems?.[0].garmentId).toBe('g1');
    expect(dump.lookItems?.[0].x).toBe(0.5);
    expect(dump.garments.map((g) => g.id)).toEqual(['g1']);

    // 关闭重开同一文件（再次重启）数据仍一致
    const c = await reopenDb(b);
    const dump2 = await dumpAll(c.db);
    expect(dump2.looks).toHaveLength(1);
    expect(dump2.lookItems).toHaveLength(1);
    c.close();
  });

  it('v5 旧镜像（无 looks/lookItems 字段）兼容恢复，造型按空处理', async () => {
    mockFiles.clear();
    const v5 = {
      version: 5,
      updatedAt: 7_000,
      garments: [
        {
          id: 'g1', name: '旧衬衫', category: 'top', status: 'clean',
          priceMinor: null, currency: null, purchaseDate: null,
          archivedAt: null, deletedAt: null, createdAt: 1_000, updatedAt: 1_000,
        },
      ],
      assets: [],
      tags: [],
      statusEvents: [],
      cutoutJobs: [],
      maskStrokes: [],
      recommendations: [],
      recommendationItems: [],
      reasonCodes: [],
      wearLogs: [],
      wearLogItems: [],
      feedbackEvents: [],
      weatherCache: [],
    };
    mockFiles.set(MIRROR_PATH, JSON.stringify(v5));

    const b = await openTestDb();
    const restored = await restoreFromMirrorIfNeeded(ROOT, b.db, drizzleAsExpo(b));
    expect(restored).toBe(true);
    const dump = await dumpAll(b.db);
    expect(dump.garments.map((g) => g.id)).toEqual(['g1']);
    expect(dump.looks).toEqual([]);
    expect(dump.lookItems).toEqual([]);
    b.close();
  });

  it('镜像不新于 DB 时不回灌', async () => {
    mockFiles.clear();
    const a = await openTestDb();
    await seed(a.db);
    await writeMirror(ROOT, a.db, drizzleAsExpo(a), 3_000);
    // 同一 DB：data_updated_at 已为 3_000，不新不旧 → 不回灌
    expect(await restoreFromMirrorIfNeeded(ROOT, a.db, drizzleAsExpo(a))).toBe(false);
    const m = await readMirror(ROOT);
    expect(m?.version).toBe(8);
    a.close();
  });
});
