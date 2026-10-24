/**
 * 设备单例运行时（6 个 service 共享）。
 *
 * 抽取自 planService/tripService/packingService/insightsService/garmentsService/lookService
 * 的逐字复制样板：dbHolder / rootAbs / restored / db() / readyDb() / persist() / root()。
 *
 * - readyDb：开库 + 镜像回灌完成，确保读写基于最新持久数据。
 * - persist：写后全量落镜像（本机 expo-sqlite 不 fsync，跨强杀由镜像兜底）。
 * - root：App 私有目录绝对路径（clothes/）。
 *
 * 不引入 close+reopen：expo-sqlite 连接为单例共享，关闭会使其它持有者拿到 closed resource。
 */
import * as FileSystem from 'expo-file-system/legacy';

import type { AppDb } from './expoDb';
import { openAppDb } from './expoDb';
import { restoreFromMirrorIfNeeded, writeMirror } from '../garments/mirror';

export interface ServiceRuntime {
  /** 等待开库+回灌完成，返回 AppDb。 */
  readyDb(): Promise<AppDb>;
  /** 写后落持久镜像。只读 service（如 insights）可不调用。 */
  persist(): Promise<void>;
  /** App 私有目录绝对路径（clothes/）。 */
  root(): string;
  /** 仅测试/调试：重置单例（不删数据）。 */
  resetForTest(): void;
}

interface RuntimeState {
  opened: Promise<AppDb>;
  restored: Promise<void>;
}

let runtimeState: RuntimeState | null = null;
let rootAbs: string | null = null;

function state(): RuntimeState {
  if (!runtimeState) {
    const opened = openAppDb();
    // 首次开库后从持久镜像回灌（补齐本机 expo-sqlite 不落盘）。
    const restored = opened
      .then((app) => restoreFromMirrorIfNeeded(root(), app.db, app.drizzleDb))
      .then(() => undefined);
    runtimeState = { opened, restored };
  }
  return runtimeState;
}

function root(): string {
  if (!rootAbs) {
    const base = FileSystem.documentDirectory?.replace(/\/$/, '') ?? '/tmp';
    rootAbs = `${base}/clothes`;
  }
  return rootAbs;
}

async function readyRuntimeDb(): Promise<AppDb> {
  // 保存同一代 state 的快照：即使测试在恢复期间 reset，也不能跳过本次恢复。
  const current = state();
  const app = await current.opened;
  await current.restored;
  return app;
}

export function createServiceRuntime(): ServiceRuntime {
  return {
    readyDb: readyRuntimeDb,
    async persist(): Promise<void> {
      // 写镜像前必须等首次回灌完成，否则可能用空库覆盖有效镜像。
      const app = await readyRuntimeDb();
      await writeMirror(root(), app.db, app.drizzleDb, Date.now());
    },
    root,
    resetForTest() {
      runtimeState = null;
      rootAbs = null;
    },
  };
}
