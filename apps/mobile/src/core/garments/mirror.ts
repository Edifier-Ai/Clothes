import * as FileSystem from 'expo-file-system/legacy';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';

import type { GarmentDb, GarmentDump } from '../db/dao';
import { bumpDataVersion, dumpAll, replaceAll } from '../db/dao';
import * as schema from '../db/schema';
import {
  cutoutJobs,
  feedbackEvents,
  maskStrokes,
  recommendationItems,
  recommendations,
  reasonCodes,
  shoppingCandidates,
  wearLogItems,
  wearLogs,
  weatherCache,
  type CutoutJobRow,
  type FeedbackEventRow,
  type MaskStrokeRow,
  type RecommendationItemRow,
  type RecommendationRow,
  type ReasonCodeRow,
  type ShoppingCandidateRow,
  type WearLogItemRow,
  type WearLogRow,
  type WeatherCacheRow,
} from '../db/schema';

/**
 * 持久化镜像 v6（B-4 设备适配）。
 *
 * 本机 expo-sqlite 提交不 fsync，进程被杀即丢最近写入；expo-file-system 写文件跨强杀持久。
 * 故以本镜像为持久事实源：每次写后全量 JSON 落盘，启动时若镜像较新则回灌 SQLite。
 * v2 加入 cutoutJobs + maskStrokes；v3 加入 recommendations + recommendation_items + reason_codes
 * + wear_logs + wear_log_items，使推荐快照与穿着记录也跨强杀恢复；v4 加入反馈和天气缓存；
 * v5 加入 garment_status_events（随 GarmentDump.statusEvents，MVP-007 状态历史）；
 * v6 加入 looks + look_items（随 GarmentDump.looks/lookItems，MVP-008 造型）；
 * v7 加入 plans（随 GarmentDump.plans，MVP-009 计划）；
 * v8 加入 trips + trip_outfits + packing_items + trip_templates（随 GarmentDump，
 *   MVP-010 旅行打包）；v9 加入独立 shopping_candidates（MVP-012 买前决策）。
 */

const MIRROR_REL = 'garments_mirror.json';
const writeQueues = new Map<string, Promise<void>>();

export interface RecDump {
  recommendations: RecommendationRow[];
  recommendationItems: RecommendationItemRow[];
  reasonCodes: ReasonCodeRow[];
  wearLogs: WearLogRow[];
  wearLogItems: WearLogItemRow[];
}

export interface MirrorFileV9 extends GarmentDump {
  version: 9;
  updatedAt: number;
  cutoutJobs: CutoutJobRow[];
  maskStrokes: MaskStrokeRow[];
  recommendations: RecommendationRow[];
  recommendationItems: RecommendationItemRow[];
  reasonCodes: ReasonCodeRow[];
  wearLogs: WearLogRow[];
  wearLogItems: WearLogItemRow[];
  feedbackEvents: FeedbackEventRow[];
  weatherCache: WeatherCacheRow[];
  shoppingCandidates: ShoppingCandidateRow[];
}

export interface MirrorFileV8 extends GarmentDump {
  version: 8;
  updatedAt: number;
  cutoutJobs: CutoutJobRow[];
  maskStrokes: MaskStrokeRow[];
  recommendations: RecommendationRow[];
  recommendationItems: RecommendationItemRow[];
  reasonCodes: ReasonCodeRow[];
  wearLogs: WearLogRow[];
  wearLogItems: WearLogItemRow[];
  feedbackEvents: FeedbackEventRow[];
  weatherCache: WeatherCacheRow[];
}

/** v7 镜像（兼容旧文件读取；trips/tripOutfits/packingItems/tripTemplates 在 GarmentDump 内为可选，回灌按空处理）。 */
export interface MirrorFileV7 extends GarmentDump {
  version: 7;
  updatedAt: number;
  cutoutJobs: CutoutJobRow[];
  maskStrokes: MaskStrokeRow[];
  recommendations: RecommendationRow[];
  recommendationItems: RecommendationItemRow[];
  reasonCodes: ReasonCodeRow[];
  wearLogs: WearLogRow[];
  wearLogItems: WearLogItemRow[];
  feedbackEvents: FeedbackEventRow[];
  weatherCache: WeatherCacheRow[];
}

/** v6 镜像（兼容旧文件读取；plans 在 GarmentDump 内为可选，回灌按空处理）。 */
export interface MirrorFileV6 extends GarmentDump {
  version: 6;
  updatedAt: number;
  cutoutJobs: CutoutJobRow[];
  maskStrokes: MaskStrokeRow[];
  recommendations: RecommendationRow[];
  recommendationItems: RecommendationItemRow[];
  reasonCodes: ReasonCodeRow[];
  wearLogs: WearLogRow[];
  wearLogItems: WearLogItemRow[];
  feedbackEvents: FeedbackEventRow[];
  weatherCache: WeatherCacheRow[];
}

export interface MirrorFileV5 extends GarmentDump {
  version: 5;
  updatedAt: number;
  cutoutJobs: CutoutJobRow[];
  maskStrokes: MaskStrokeRow[];
  recommendations: RecommendationRow[];
  recommendationItems: RecommendationItemRow[];
  reasonCodes: ReasonCodeRow[];
  wearLogs: WearLogRow[];
  wearLogItems: WearLogItemRow[];
  feedbackEvents: FeedbackEventRow[];
  weatherCache: WeatherCacheRow[];
}

export interface MirrorFileV4 extends GarmentDump {
  version: 4;
  updatedAt: number;
  cutoutJobs: CutoutJobRow[];
  maskStrokes: MaskStrokeRow[];
  recommendations: RecommendationRow[];
  recommendationItems: RecommendationItemRow[];
  reasonCodes: ReasonCodeRow[];
  wearLogs: WearLogRow[];
  wearLogItems: WearLogItemRow[];
  feedbackEvents: FeedbackEventRow[];
  weatherCache: WeatherCacheRow[];
}

export interface MirrorFileV3 extends GarmentDump {
  version: 3;
  updatedAt: number;
  cutoutJobs: CutoutJobRow[];
  maskStrokes: MaskStrokeRow[];
  recommendations: RecommendationRow[];
  recommendationItems: RecommendationItemRow[];
  reasonCodes: ReasonCodeRow[];
  wearLogs: WearLogRow[];
  wearLogItems: WearLogItemRow[];
}

/** v2 镜像（兼容旧文件读取，回灌后只补 v3 表为空）。 */
export interface MirrorFileV2 extends GarmentDump {
  version: 2;
  updatedAt: number;
  cutoutJobs: CutoutJobRow[];
  maskStrokes: MaskStrokeRow[];
}

export type MirrorFile =
  | MirrorFileV9
  | MirrorFileV8
  | MirrorFileV7
  | MirrorFileV6
  | MirrorFileV5
  | MirrorFileV4
  | MirrorFileV3
  | MirrorFileV2
  | (GarmentDump & { version: 1; updatedAt: number });

function mirrorPath(rootAbs: string): string {
  return `${rootAbs}/${MIRROR_REL}`;
}

async function dumpExtra(drizzleDb: ExpoSQLiteDatabase<typeof schema>): Promise<{
  cutoutJobs: CutoutJobRow[];
  maskStrokes: MaskStrokeRow[];
  feedbackEvents: FeedbackEventRow[];
  weatherCache: WeatherCacheRow[];
  shoppingCandidates: ShoppingCandidateRow[];
} & RecDump> {
  const cutoutJobsRows = (await drizzleDb.select().from(cutoutJobs).all()) as unknown as CutoutJobRow[];
  const maskStrokesRows = (await drizzleDb.select().from(maskStrokes).all()) as unknown as MaskStrokeRow[];
  const recRows = (await drizzleDb.select().from(recommendations).all()) as unknown as RecommendationRow[];
  const recItemRows = (await drizzleDb.select().from(recommendationItems).all()) as unknown as RecommendationItemRow[];
  const reasonRows = (await drizzleDb.select().from(reasonCodes).all()) as unknown as ReasonCodeRow[];
  const wearLogRows = (await drizzleDb.select().from(wearLogs).all()) as unknown as WearLogRow[];
  const wearLogItemRows = (await drizzleDb.select().from(wearLogItems).all()) as unknown as WearLogItemRow[];
  const feedbackRows = (await drizzleDb.select().from(feedbackEvents).all()) as unknown as FeedbackEventRow[];
  const weatherRows = (await drizzleDb.select().from(weatherCache).all()) as unknown as WeatherCacheRow[];
  const shoppingRows = (await drizzleDb.select().from(shoppingCandidates).all()) as unknown as ShoppingCandidateRow[];
  return {
    cutoutJobs: cutoutJobsRows,
    maskStrokes: maskStrokesRows,
    recommendations: recRows,
    recommendationItems: recItemRows,
    reasonCodes: reasonRows,
    wearLogs: wearLogRows,
    wearLogItems: wearLogItemRows,
    feedbackEvents: feedbackRows,
    weatherCache: weatherRows,
    shoppingCandidates: shoppingRows,
  };
}

async function writeMirrorOnce(
  rootAbs: string,
  db: GarmentDb,
  drizzleDb?: ExpoSQLiteDatabase<typeof schema>,
  now: number = Date.now(),
): Promise<void> {
  // 干净安装可能尚未经过图片导入流程，持久目录不存在；所有首次业务写入都必须能独立落盘。
  await FileSystem.makeDirectoryAsync(rootAbs, { intermediates: true });
  const dump = await dumpAll(db);
  const extra = drizzleDb ? await dumpExtra(drizzleDb) : {
    cutoutJobs: [], maskStrokes: [],
    recommendations: [], recommendationItems: [], reasonCodes: [],
    wearLogs: [], wearLogItems: [],
    feedbackEvents: [], weatherCache: [],
    shoppingCandidates: [],
  };
  const payload: MirrorFileV9 = { version: 9, updatedAt: now, ...dump, ...extra };
  const target = mirrorPath(rootAbs);
  const staged = `${target}.tmp`;
  const backup = `${target}.bak`;
  await FileSystem.deleteAsync(staged, { idempotent: true });
  await FileSystem.writeAsStringAsync(staged, JSON.stringify(payload), {
    encoding: FileSystem.EncodingType.UTF8,
  });
  const existing = await FileSystem.getInfoAsync(target);
  if (existing.exists) {
    await FileSystem.deleteAsync(backup, { idempotent: true });
    await FileSystem.moveAsync({ from: target, to: backup });
  }
  try {
    await FileSystem.moveAsync({ from: staged, to: target });
  } catch (error) {
    // 提交失败时尽力把上一份有效镜像放回；readMirror 也会回退读取 .bak。
    const previous = await FileSystem.getInfoAsync(backup);
    if (previous.exists) await FileSystem.moveAsync({ from: backup, to: target }).catch(() => undefined);
    throw error;
  }
  await FileSystem.deleteAsync(backup, { idempotent: true });
  // 镜像已原子提交后再推进 DB 版本。若这里中断，镜像较新，启动回灌仍能恢复。
  await bumpDataVersion(db, now);
}

/** 同一根目录串行写，避免多个 service 的全量快照彼此覆盖/交错。 */
export async function writeMirror(
  rootAbs: string,
  db: GarmentDb,
  drizzleDb?: ExpoSQLiteDatabase<typeof schema>,
  now: number = Date.now(),
): Promise<void> {
  const previous = writeQueues.get(rootAbs) ?? Promise.resolve();
  const queued = previous.catch(() => undefined).then(() => writeMirrorOnce(rootAbs, db, drizzleDb, now));
  writeQueues.set(rootAbs, queued);
  try {
    await queued;
  } finally {
    if (writeQueues.get(rootAbs) === queued) writeQueues.delete(rootAbs);
  }
}

export async function readMirror(rootAbs: string): Promise<MirrorFile | null> {
  const target = mirrorPath(rootAbs);
  // target 解析失败或原子换名中断时，上一份 .bak 仍是可恢复事实；不读取未提交的 .tmp。
  for (const path of [target, `${target}.bak`]) {
    try {
      const info = await FileSystem.getInfoAsync(path);
      if (!info.exists) continue;
      const text = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.UTF8 });
      return JSON.parse(text) as MirrorFile;
    } catch {
      // 尝试下一份有效镜像。
    }
  }
  return null;
}

async function restoreExtra(
  drizzleDb: ExpoSQLiteDatabase<typeof schema>,
  m: MirrorFileV4 & { shoppingCandidates?: ShoppingCandidateRow[] },
): Promise<void> {
  // 全量替换队列/操作栈/推荐/穿着记录（镜像为事实源）
  await drizzleDb.delete(shoppingCandidates);
  await drizzleDb.delete(weatherCache);
  await drizzleDb.delete(feedbackEvents);
  await drizzleDb.delete(wearLogItems);
  await drizzleDb.delete(wearLogs);
  await drizzleDb.delete(reasonCodes);
  await drizzleDb.delete(recommendationItems);
  await drizzleDb.delete(recommendations);
  await drizzleDb.delete(maskStrokes);
  await drizzleDb.delete(cutoutJobs);
  for (const j of m.cutoutJobs) await drizzleDb.insert(cutoutJobs).values(j);
  for (const s of m.maskStrokes) await drizzleDb.insert(maskStrokes).values(s);
  for (const r of m.recommendations) await drizzleDb.insert(recommendations).values(r);
  for (const ri of m.recommendationItems) await drizzleDb.insert(recommendationItems).values(ri);
  for (const rc of m.reasonCodes) await drizzleDb.insert(reasonCodes).values(rc);
  for (const w of m.wearLogs) await drizzleDb.insert(wearLogs).values(w);
  for (const wi of m.wearLogItems) await drizzleDb.insert(wearLogItems).values(wi);
  for (const f of m.feedbackEvents) await drizzleDb.insert(feedbackEvents).values(f);
  for (const w of m.weatherCache) await drizzleDb.insert(weatherCache).values(w);
  for (const candidate of m.shoppingCandidates ?? []) {
    await drizzleDb.insert(shoppingCandidates).values(candidate);
  }
}

/** 启动时：若镜像较新则回灌 SQLite（含 v3 推荐与穿着记录），返回是否回灌。 */
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
    if (mirror.version >= 2 && drizzleDb) {
      // v2 镜像没有 v3 字段，按空数组回灌（删表后重插空）
      const base = mirror as MirrorFileV2;
      const v4: MirrorFileV4 = mirror.version >= 4
        ? // v4/v5/v6 的扩展表结构一致；v5 的 statusEvents、v6 的 looks/lookItems
          // 都在 GarmentDump 内由 replaceAll 恢复
          (mirror as MirrorFileV4)
        : mirror.version === 3
          ? {
              ...(mirror as MirrorFileV3),
              version: 4,
              feedbackEvents: [],
              weatherCache: [],
            }
          : {
            version: 4,
            updatedAt: base.updatedAt,
            garments: base.garments,
            assets: base.assets,
            tags: base.tags,
            cutoutJobs: base.cutoutJobs,
            maskStrokes: base.maskStrokes,
            recommendations: [],
            recommendationItems: [],
            reasonCodes: [],
            wearLogs: [],
            wearLogItems: [],
            feedbackEvents: [],
            weatherCache: [],
          };
      await restoreExtra(drizzleDb, v4);
    }
    await bumpDataVersion(db, mirror.updatedAt);
    return true;
  }
  return false;
}
