import { createServiceRuntime, type ServiceRuntime } from '@/core/db/serviceRuntime';

import {
  applyDemoDataPack,
  buildDemoDataPack,
  type DemoDataPack,
  type DemoSqlExecutor,
} from './demoDataPack';
import { installBundledDemoAssets } from './demoAssetInstaller';

export interface DemoDataSummary {
  anchorDate: string;
  garments: number;
  looks: number;
  plans: number;
  wearDays: number;
  shoppingCases: number;
}

export interface DemoDataService {
  load(anchorDate?: string): Promise<DemoDataSummary>;
}

function localDate(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function summary(pack: DemoDataPack): DemoDataSummary {
  return {
    anchorDate: pack.anchorDate,
    garments: pack.garments.length,
    looks: pack.looks.length,
    plans: pack.plans.length,
    wearDays: pack.wearLogs.length,
    shoppingCases: pack.shoppingCandidates.length,
  };
}

export function createDemoDataService(
  runtime: ServiceRuntime = createServiceRuntime(),
): DemoDataService {
  return {
    async load(anchorDate = localDate()): Promise<DemoDataSummary> {
      const app = await runtime.readyDb();
      const executor: DemoSqlExecutor = {
        transaction: (work) => app.raw.withTransactionAsync(work),
        run: async (sql, params) => {
          await app.raw.runAsync(sql, ...params);
        },
      };
      const pack = buildDemoDataPack(anchorDate);
      await installBundledDemoAssets();
      await applyDemoDataPack(executor, pack);
      await runtime.persist();
      return summary(pack);
    },
  };
}

export const defaultDemoDataService = createDemoDataService();
