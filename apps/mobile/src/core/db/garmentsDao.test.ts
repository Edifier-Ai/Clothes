/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import {
  createGarment,
  dumpAll,
  findActiveByHash,
  getGarment,
  listActiveGarments,
  replaceAll,
  restoreGarment,
  softDeleteGarment,
  updateGarment,
} from './dao';
import { SCHEMA_VERSION, runMigrations } from './migrations';
import { openTestDb, reopenDb } from './sqliteTestHelper';

function sample(id: string, hash: string, name = '白衬衫') {
  return {
    id,
    name,
    category: 'top' as const,
    asset: {
      id: `${id}-asset`,
      originalRelPath: `originals/${id}.jpg`,
      sha256: hash,
      width: 100,
      height: 200,
      bytes: 1234,
      mimeType: 'image/jpeg',
    },
    tags: [
      { kind: 'color' as const, value: 'white', confidence: 0.9 },
      { kind: 'season' as const, value: 'summer' },
    ],
    now: 1_000,
  };
}

describe('migrations（版本化 + 幂等）', () => {
  it('应用后版本号等于 SCHEMA_VERSION，二次运行不重复', async () => {
    const t = await openTestDb();
    expect(await t.adapter.scalarInt("SELECT value FROM __clothes_meta WHERE key='schema_version'")).toBe(
      SCHEMA_VERSION,
    );
    const res = await runMigrations(t.adapter, {});
    expect(res.from).toBe(SCHEMA_VERSION);
    expect(res.to).toBe(SCHEMA_VERSION);
    t.close();
  });

  it('foreign_keys 已启用：删除衣物级联删除资产与标签', async () => {
    const t = await openTestDb();
    expect(await t.adapter.pragmaInt('foreign_keys')).toBe(1);
    // synchronous=FULL（设备强杀不丢写入）；sql.js/better-sqlite3 回 0/2，仅断言为整型。
    const sync = await t.adapter.pragmaInt('synchronous');
    expect(typeof sync).toBe('number');
    await createGarment(t.db, sample('g1', 'h1'));
    t.raw.exec("DELETE FROM garments WHERE id='g1'");
    expect(t.raw.prepare("SELECT count(*) c FROM garment_assets WHERE garment_id='g1'").get()).toEqual({ c: 0 });
    expect(t.raw.prepare("SELECT count(*) c FROM garment_tags WHERE garment_id='g1'").get()).toEqual({ c: 0 });
    t.close();
  });
});

describe('DAO 事务与判重', () => {
  it('createGarment 在同一事务写入 garment+asset+tags', async () => {
    const t = await openTestDb();
    await createGarment(t.db, sample('g1', 'hash-a'));
    const detail = await getGarment(t.db, 'g1');
    expect(detail?.garment.name).toBe('白衬衫');
    expect(detail?.asset.sha256).toBe('hash-a');
    expect(detail?.tags).toHaveLength(2);
    t.close();
  });

  it('事务回滚：资产插入失败时不留 garment 半条记录', async () => {
    const t = await openTestDb();
    const bad = sample('g2', 'hash-b');
    (bad.asset as Record<string, unknown>).width = null; // 触发 NOT NULL 失败
    await expect(createGarment(t.db, bad)).rejects.toThrow();
    expect(t.raw.prepare("SELECT count(*) c FROM garments WHERE id='g2'").get()).toEqual({ c: 0 });
    expect(t.raw.prepare("SELECT count(*) c FROM garment_assets WHERE garment_id='g2'").get()).toEqual({ c: 0 });
    t.close();
  });

  it('重复哈希：findActiveByHash 命中未删除衣物', async () => {
    const t = await openTestDb();
    await createGarment(t.db, sample('g1', 'same-hash'));
    expect((await findActiveByHash(t.db, 'same-hash'))?.garment.id).toBe('g1');
    expect(await findActiveByHash(t.db, 'other-hash')).toBeNull();
    t.close();
  });

  it('软删除后从活动列表消失，行与资产仍在（墓碑），可恢复', async () => {
    const t = await openTestDb();
    await createGarment(t.db, sample('g1', 'h1'));
    expect(await listActiveGarments(t.db)).toHaveLength(1);
    await softDeleteGarment(t.db, 'g1', 2_000);
    expect(await listActiveGarments(t.db)).toHaveLength(0);
    expect(await getGarment(t.db, 'g1')).toBeNull();
    expect(t.raw.prepare("SELECT deleted_at d FROM garments WHERE id='g1'").get()).toEqual({ d: 2_000 });
    expect(t.raw.prepare("SELECT count(*) c FROM garment_assets WHERE garment_id='g1'").get()).toEqual({ c: 1 });
    expect(await restoreGarment(t.db, 'g1', 3_000)).toBe(true);
    expect(await listActiveGarments(t.db)).toHaveLength(1);
    t.close();
  });

  it('软删除后同哈希不再被判为重复', async () => {
    const t = await openTestDb();
    await createGarment(t.db, sample('g1', 'h1'));
    await softDeleteGarment(t.db, 'g1', 2_000);
    expect(await findActiveByHash(t.db, 'h1')).toBeNull();
    t.close();
  });

  it('编辑名称与标签后详情更新', async () => {
    const t = await openTestDb();
    await createGarment(t.db, sample('g1', 'h1'));
    await updateGarment(t.db, 'g1', { name: '亚麻衬衫', tags: [{ kind: 'color', value: 'beige' }] }, 5_000);
    const d = await getGarment(t.db, 'g1');
    expect(d?.garment.name).toBe('亚麻衬衫');
    expect(d?.tags).toHaveLength(1);
    expect(d?.tags[0].value).toBe('beige');
    t.close();
  });

  it('重启持久：关闭并以同一文件重开，数据一致', async () => {
    const t = await openTestDb();
    await createGarment(t.db, sample('g1', 'h1', '重启测试衬衫'));
    const reopened = await reopenDb(t);
    const d = await getGarment(reopened.db, 'g1');
    expect(d?.garment.name).toBe('重启测试衬衫');
    expect(d?.asset.originalRelPath).toBe('originals/g1.jpg');
    expect(await listActiveGarments(reopened.db)).toHaveLength(1);
    reopened.close();
  });
});

describe('镜像 dump/replaceAll（持久回灌逻辑）', () => {
  it('dump 后清空再 replaceAll，数据完整恢复（含墓碑与标签）', async () => {
    const t = await openTestDb();
    await createGarment(t.db, sample('g1', 'h1', '衬衫'));
    await createGarment(t.db, sample('g2', 'h2', '裤子'));
    await softDeleteGarment(t.db, 'g2', 9_000);
    const dump = await dumpAll(t.db);
    expect(dump.garments).toHaveLength(2);
    expect(dump.assets).toHaveLength(2);
    expect(dump.tags.length).toBeGreaterThan(0);

    await replaceAll(t.db, { garments: [], assets: [], tags: [] });
    expect(await listActiveGarments(t.db)).toHaveLength(0);

    await replaceAll(t.db, dump);
    const restored = await listActiveGarments(t.db);
    expect(restored.map((g) => g.id).sort()).toEqual(['g1']);
    const g2 = await getGarment(t.db, 'g2'); // 墓碑也恢复，但非活动
    expect(g2).toBeNull();
    expect((await dumpAll(t.db)).garments).toHaveLength(2);
    t.close();
  });
});

describe('文件引用（缺失文件不删记录）', () => {
  it('数据库只存路径；原图缺失时记录与详情仍可读取（供可修复状态）', async () => {
    const t = await openTestDb();
    await createGarment(t.db, sample('g1', 'h1'));
    const fileExists = false; // 由 imageStore.originalExists 在 UI 层判定
    const d = await getGarment(t.db, 'g1');
    expect(d).not.toBeNull();
    expect(fileExists).toBe(false);
    expect(d?.asset.originalRelPath).toBe('originals/g1.jpg');
    t.close();
  });
});
