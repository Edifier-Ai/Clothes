import * as FileSystem from 'expo-file-system/legacy';

import type { GarmentDb, GarmentDump } from '../db/dao';
import { bumpDataVersion, dumpAll, replaceAll } from '../db/dao';

/**
 * 持久化镜像（B-4 设备适配）。
 *
 * 背景：本机（OnePlus/Android14）实测 expo-sqlite 的提交不 fsync，进程被杀即丢最近写入；
 * 但 expo-file-system 写文件跨强杀持久（已验证）。故以本镜像文件为「持久事实源」：
 * 每次写操作后把全量数据 JSON 写入镜像（writeAsStringAsync 在本机即持久），启动时若镜像
 * 比 SQLite 内 data_updated_at 新，则回灌 SQLite。expo-sqlite 仍作会话内查询引擎，
 * 满足 TECH_STACK「本地 SQLite」的同时补齐本机缺失的落盘能力。
 */

const MIRROR_REL = 'garments_mirror.json';

export interface MirrorFile extends GarmentDump {
  version: 1;
  updatedAt: number;
}

function mirrorPath(rootAbs: string): string {
  return `${rootAbs}/${MIRROR_REL}`;
}

export async function writeMirror(rootAbs: string, db: GarmentDb, now: number): Promise<void> {
  await bumpDataVersion(db, now);
  const dump = await dumpAll(db);
  const payload: MirrorFile = { version: 1, updatedAt: now, ...dump };
  const path = mirrorPath(rootAbs);
  await FileSystem.writeAsStringAsync(path, JSON.stringify(payload), {
    encoding: FileSystem.EncodingType.UTF8,
  });
}

export async function readMirror(rootAbs: string): Promise<MirrorFile | null> {
  try {
    const info = await FileSystem.getInfoAsync(mirrorPath(rootAbs));
    if (!info.exists) return null;
    const text = await FileSystem.readAsStringAsync(mirrorPath(rootAbs), {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return JSON.parse(text) as MirrorFile;
  } catch {
    return null;
  }
}

/** 启动时：若镜像较新则回灌 SQLite，返回是否回灌。 */
export async function restoreFromMirrorIfNeeded(rootAbs: string, db: GarmentDb): Promise<boolean> {
  const mirror = await readMirror(rootAbs);
  if (!mirror) return false;
  const dbVersion = (await db.getMetaInt('data_updated_at')) ?? 0;
  if (mirror.updatedAt > dbVersion) {
    await replaceAll(db, mirror);
    await bumpDataVersion(db, mirror.updatedAt);
    return true;
  }
  return false;
}
