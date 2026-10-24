/** @jest-environment node */
import { describe, expect, it } from '@jest/globals';

import { openTestDb } from '@/core/db/sqliteTestHelper';
import {
  getCostPerWearListCore,
  getMonthlyReportCore,
  getOverviewCore,
} from '@/core/insights/insightsService';
import {
  applyDemoDataPack,
  buildDemoDataPack,
  type DemoSqlExecutor,
} from './demoDataPack';

function executor(raw: ReturnType<typeof openTestDb> extends Promise<infer T> ? T extends { raw: infer R } ? R : never : never): DemoSqlExecutor {
  return {
    transaction: async (work) => {
      raw.exec('BEGIN');
      try {
        await work();
        raw.exec('COMMIT');
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
    run: async (sql, params) => {
      raw.prepare(sql).run(...params);
    },
  };
}

describe('DemoDataPack', () => {
  it('固定生成 54 件带图片衣物、18 套造型、7 条计划、20 天穿着与 1 个购物案例', () => {
    const pack = buildDemoDataPack('2026-08-27');
    expect(pack.garments).toHaveLength(54);
    expect(pack.looks).toHaveLength(18);
    expect(pack.plans).toHaveLength(7);
    expect(pack.wearLogs).toHaveLength(20);
    expect(pack.shoppingCandidates).toHaveLength(1);
    expect(pack.plans.map((plan) => plan.date)).toEqual(['2026-08-27', '2026-08-28', '2026-08-30', '2026-08-29', '2026-09-01', '2026-08-31', '2026-09-02']);
    expect(new Set(pack.garments.map((garment) => garment.id)).size).toBe(54);
    expect(pack.garments.every((item) => item.asset.originalRelPath.endsWith('.webp'))).toBe(true);
    expect(pack.garments.every((item) => item.asset.sha256.length === 64)).toBe(true);
    expect(new Set(pack.looks[0].items.map((item) => `${item.x}:${item.y}`)).size).toBeGreaterThan(1);
    expect(pack.looks.flatMap((item) => item.items).every((item) => item.scale < 0.5)).toBe(true);
  });

  it('同一天重复载入结果幂等，不触碰非 demo 数据', async () => {
    const db = await openTestDb();
    db.raw.prepare(`INSERT INTO garments(id,name,category,status,created_at,updated_at) VALUES(?,?,?,?,?,?)`)
      .run('user-garment', '用户衣物', 'top', 'clean', 1, 1);
    const pack = buildDemoDataPack('2026-08-27');
    await applyDemoDataPack(executor(db.raw), pack);
    db.raw.prepare(`INSERT INTO wear_logs(id,recommendation_id,date,occasion,comfort,created_at) VALUES(?,?,?,?,?,?)`)
      .run('user-wear', 'user-recommendation', '2026-08-27', 'commute', 'good', 2);
    db.raw.prepare(`INSERT INTO wear_log_items(id,wear_log_id,garment_id,slot,ord) VALUES(?,?,?,?,?)`)
      .run('user-wear-item', 'user-wear', 'demo-v1-top-01', 'top', 0);
    await applyDemoDataPack(executor(db.raw), pack);

    expect(db.raw.prepare(`SELECT COUNT(*) AS n FROM garments WHERE id LIKE 'demo-v1-%'`).get()).toEqual({ n: 54 });
    expect(db.raw.prepare(`SELECT COUNT(*) AS n FROM garment_assets WHERE garment_id LIKE 'demo-v1-%'`).get()).toEqual({ n: 54 });
    expect(db.raw.prepare(`SELECT COUNT(*) AS n FROM looks WHERE id LIKE 'demo-v1-%'`).get()).toEqual({ n: 18 });
    expect(db.raw.prepare(`SELECT COUNT(*) AS n FROM plans WHERE id LIKE 'demo-v1-%'`).get()).toEqual({ n: 7 });
    expect(db.raw.prepare(`SELECT COUNT(*) AS n FROM wear_logs WHERE id LIKE 'demo-v1-%'`).get()).toEqual({ n: 20 });
    expect(db.raw.prepare(`SELECT name FROM garments WHERE id='user-garment'`).get()).toEqual({ name: '用户衣物' });
    expect(db.raw.prepare(`SELECT garment_id FROM wear_log_items WHERE id='user-wear-item'`).get()).toEqual({ garment_id: 'demo-v1-top-01' });
    db.close();
  });

  it('载入后可直接驱动总览、成本次与月度深度洞察', async () => {
    const db = await openTestDb();
    await applyDemoDataPack(executor(db.raw), buildDemoDataPack('2026-08-27'));
    const now = Date.parse('2026-08-27T12:00:00.000Z');
    const overview = await getOverviewCore(db.db, db.drizzleDb, now);
    const cost = await getCostPerWearListCore(db.db, db.drizzleDb);
    const monthly = await getMonthlyReportCore(db.db, db.drizzleDb, '2026-08', now);

    expect(overview.overview.wearDays).toBe(20);
    expect(overview.overview.totalGarments).toBe(54);
    expect(overview.overview.activatedGarments).toBeGreaterThanOrEqual(35);
    expect(cost.rows.length).toBeGreaterThanOrEqual(35);
    expect(monthly.monthly.wearDays).toBe(20);
    expect(monthly.hasLeak).toBe(false);
    db.close();
  });

  it('中途写入失败整包回滚，既有 demo 与用户数据均保持原样', async () => {
    const db = await openTestDb();
    db.raw.prepare(`INSERT INTO garments(id,name,category,status,created_at,updated_at) VALUES(?,?,?,?,?,?)`)
      .run('user-garment', '用户衣物', 'top', 'clean', 1, 1);
    const base = executor(db.raw);
    let writes = 0;
    const failing: DemoSqlExecutor = {
      transaction: base.transaction,
      run: async (sql, params) => {
        writes += 1;
        if (writes === 10) throw new Error('injected-demo-failure');
        await base.run(sql, params);
      },
    };
    await expect(applyDemoDataPack(failing, buildDemoDataPack('2026-08-27'))).rejects.toThrow('injected-demo-failure');
    expect(db.raw.prepare(`SELECT COUNT(*) AS n FROM garments WHERE id LIKE 'demo-v1-%'`).get()).toEqual({ n: 0 });
    expect(db.raw.prepare(`SELECT name FROM garments WHERE id='user-garment'`).get()).toEqual({ name: '用户衣物' });
    db.close();
  });
});
