import * as FileSystem from 'expo-file-system/legacy';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';

import type { GarmentDb, GarmentDump } from '../db/dao';
import { bumpDataVersion, dumpAll, replaceAll } from '../db/dao';
import * as schema from '../db/schema';
import { cutoutJobs, maskStrokes, type CutoutJobRow, type MaskStrokeRow } from '../db/schema';

/**
 * 持久化镜像 v2（B-4 设备适配）。
 *
 * 本机 expo-sqlite 提交不 fsync，进程被杀即丢最近写入；expo-file-system 写文件跨强杀持久。
 * 故以本镜像为持久事实源：每次写后全量 JSON 落盘，启动时若镜像较新则回灌 SQLite。
 * v2 在 v1（garments/assets/tags）基础上加入 cutoutJobs + maskStrokes，使批量队列与修边操作栈
 * 也能跨强杀恢复（满足「杀进程从已提交位置继续」「手修退出重进一致」）。
 */

const MIRROR_REL = 'garments_mirror.json';

export interface MirrorFileV2 extends GarmentDump {
  version: 2;
  updatedAt: number;
  cutoutJobs: CutoutJobRow[];
  maskStrokes: MaskStrokeRow[];
}

export type MirrorFile = MirrorFileV2 | (GarmentDump & { version: 1; updatedAt: number });

function mirrorPath(rootAbs: string): string {
  return `${rootAbs}/${MIRROR_REL}`;
}

async function dumpJobsStrokes(drizzleDb: ExpoSQLiteDatabase<typeof schema>): Promise<{ cutoutJobs: CutoutJobRow[]; maskStrokes: MaskStrokeRow[] }> {
  const cutoutJobsRows = (await drizzleDb.select().from(cutoutJobs).all()) as CutoutJobRow[];
  const maskStrokesRows = (await drizzleDb.select().from(maskStrokes).all()) as MaskStrokeRow[];
  return { cutoutJobs: cutoutJobsRows, maskStrokes: maskStrokesRows };
}

export async function writeMirror(
  rootAbs: string,
  db: GarmentDb,
  drizzleDb?: ExpoSQLiteDatabase<typeof schema>,
  now: number = Date.now(),
): Promise<void> {
  await bumpDataVersion(db, now);
  const dump = await dumpAll(db);
  const js = drizzleDb ? await dumpJobsStrokes(drizzleDb) : { cutoutJobs: [], maskStrokes: [] };
  const payload: MirrorFileV2 = { version: 2, updatedAt: now, ...dump, ...js };
  await FileSystem.writeAsStringAsync(mirrorPath(rootAbs), JSON.stringify(payload), {
    encoding: FileSystem.EncodingType.UTF8,
  });
}

export async function readMirror(rootAbs: string): Promise<MirrorFile | null> {
  try {
    const info = await FileSystem.getInfoAsync(mirrorPath(rootAbs));
    if (!info.exists) return null;
    const text = await FileSystem.readAsStringAsync(mirrorPath(rootAbs), { encoding: FileSystem.EncodingType.UTF8 });
    return JSON.parse(text) as MirrorFile;
  } catch {
    return null;
  }
}

async function restoreJobsStrokes(drizzleDb: ExpoSQLiteDatabase<typeof schema>, m: MirrorFileV2): Promise<void> {
  // 全量替换队列/操作栈（镜像为事实源）
  await drizzleDb.delete(maskStrokes);
  await drizzleDb.delete(cutoutJobs);
  for (const j of m.cutoutJobs) await drizzleDb.insert(cutoutJobs).values(j);
  for (const s of m.maskStrokes) await drizzleDb.insert(maskStrokes).values(s);
}

/** 启动时：若镜像较新则回灌 SQLite（含 v2 队列/操作栈），返回是否回灌。 */
export async function restoreFromMirrorIfNeeded(
  rootAbs: string,
  db: GarmentDb,
  drizzleDb?: ExpoSQLiteDatabase<typeof schema>,
): Promise<boolean> {
  const mirror = await readMirror(rootAbs);
  if (!mirror) return false;
  const dbVersion = (await db.getMetaInt('data_updated_at')) ?? 0;
  if (mirror.updatedAt > dbVersion) {
    await replaceAll(db, mirror);
    if (mirror.version === 2 && drizzleDb) {
      await restoreJobsStrokes(drizzleDb, mirror);
    }
    await bumpDataVersion(db, mirror.updatedAt);
    return true;
  }
  return false;
}
