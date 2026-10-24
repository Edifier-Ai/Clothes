import { createServiceRuntime } from '../db/serviceRuntime';
import {
  createTrip,
  createTripOutfit,
  getLookWithItems,
  softDeleteTrip,
  softDeleteTripOutfit,
  tripActivities,
  tripOutfitIds,
  tripWeatherSnapshot,
  updateTripOutfitRow,
  updateTripRow,
  type GarmentDb,
  type TripDetail,
  type TripOutfitDetail,
} from '../db/dao';
import type { TripOutfitRow, TripRow, TripStatus } from '../db/schema';
import { uuidv7 } from '../id/uuidv7';

/**
 * 旅行服务（MVP-010）。结构仿 planService：
 * - `*Core(db, …)`：可注入持久逻辑，设备单例与 host 测试共用同一代码路径。
 * - 单例 API：readyDb + 写后 writeMirror 落持久镜像（trips/tripOutfits 随 GarmentDump 进 v8 镜像）。
 *
 * 领域规则（与任务卡对齐）：
 * - date 是当地日期字面量，服务层不做时区换算——timeZone 仅供 UI「今天是旅行第几天」换算。
 * - 关联造型的 tripOutfit 在保存时把造型单品展开成 outfit 快照：造型之后被删/改，
 *   安排展示与修复入口都不缺数据（lookMissing 由读取时计算）。
 * - 删除某日造型 = 墓碑（不动关联造型，行保留供复盘/导出）。
 * - 记录实际已穿幂等：worn_status 非 planned 再次记录原样返回，不改 wornCompletedAt。
 * - 关联造型不存在/墓碑 → 保存时抛错（不静默写空快照）；造型在保存之后被墓碑，
 *   读取时 lookMissing=true 但快照仍完整（修复入口依据）。
 */

export interface SaveTripInput {
  /** 提供且活动 → 更新；否则新建。 */
  id?: string;
  name: string;
  destination: string;
  /** YYYY-MM-DD 旅行地当地日期字面量。 */
  startDate: string;
  endDate: string;
  /** IANA 时区名。 */
  timeZone: string;
  activities?: readonly { date: string; timeLabel: string; note?: string | null }[];
  weatherSnapshot?: {
    fetchedAt: number;
    minTempC: number;
    maxTempC: number;
    conditionCode: string;
    provider: string;
    cityName: string;
  } | null;
}

export interface SaveTripOutfitInput {
  /** 提供且活动 → 更新；否则新建。 */
  id?: string;
  tripId: string;
  /** YYYY-MM-DD 当地日期字面量。 */
  date: string;
  timeLabel: string;
  occasion?: string | null;
  /** 关联造型；null = 临时组合（用 garmentIds）；更新时缺省 = 保持原有关联。 */
  lookId?: string | null;
  garmentIds?: readonly string[];
  note?: string | null;
}

export interface RecordTripOutfitWornInput {
  /** true=按计划穿（completed）；false=计划有变化（changed，需 changeNote）。 */
  asPlanned: boolean;
  changeNote?: string | null;
  now?: number;
}

/* ---------------- 可注入 Core ---------------- */

async function toDetail(db: GarmentDb, trip: TripRow): Promise<TripDetail> {
  return {
    trip,
    activities: tripActivities(trip),
    weatherSnapshot: tripWeatherSnapshot(trip),
  };
}

async function toOutfitDetail(db: GarmentDb, to: TripOutfitRow): Promise<TripOutfitDetail> {
  let lookMissing = false;
  if (to.lookId) {
    lookMissing = (await getLookWithItems(db, to.lookId)) == null;
  }
  return { tripOutfit: to, outfitGarmentIds: tripOutfitIds(to), lookMissing };
}

/** upsert 旅行：返回保存后的详情。 */
export async function saveTripCore(db: GarmentDb, input: SaveTripInput): Promise<TripDetail> {
  const now = Date.now();
  const existing = input.id ? await db.getTrip(input.id) : null;
  if (existing && existing.deletedAt == null) {
    const id = input.id!;
    await updateTripRow(db, id, {
      name: input.name,
      destination: input.destination,
      startDate: input.startDate,
      endDate: input.endDate,
      timeZone: input.timeZone,
      activities: input.activities ?? [],
      weatherSnapshot: input.weatherSnapshot ?? null,
    }, now);
    const trip = (await db.getTrip(id))!;
    return toDetail(db, trip);
  }
  const id = input.id ?? uuidv7();
  await createTrip(db, {
    id,
    name: input.name,
    destination: input.destination,
    startDate: input.startDate,
    endDate: input.endDate,
    timeZone: input.timeZone,
    activities: input.activities ?? [],
    weatherSnapshot: input.weatherSnapshot ?? null,
    now,
  });
  const trip = await db.getTrip(id);
  if (!trip) throw new Error(`saveTrip succeeded but row missing: ${id}`);
  return toDetail(db, trip);
}

export async function getTripCore(db: GarmentDb, id: string): Promise<TripDetail | null> {
  const trip = await db.getTrip(id);
  if (!trip || trip.deletedAt != null) return null;
  return toDetail(db, trip);
}

/** 活动旅行（排除墓碑），按 updatedAt 倒序，各带 activities/weatherSnapshot。 */
export async function listActiveTripsCore(db: GarmentDb): Promise<TripDetail[]> {
  const rows = await db.listActiveTrips();
  return Promise.all(rows.map((trip) => toDetail(db, trip)));
}

/** 软删旅行：仅置墓碑，行保留（行也保留 trip_outfits/packing_items，导出/复盘仍完整）。 */
export async function deleteTripCore(db: GarmentDb, id: string): Promise<void> {
  await softDeleteTrip(db, id, Date.now());
}

export async function updateTripStatusCore(db: GarmentDb, id: string, status: TripStatus): Promise<void> {
  await updateTripRow(db, id, { status }, Date.now());
}

/** upsert tripOutfit：关联造型时展开快照；返回保存后的详情。 */
export async function saveTripOutfitCore(db: GarmentDb, input: SaveTripOutfitInput): Promise<TripOutfitDetail> {
  const now = Date.now();
  let outfitGarmentIds: readonly string[] = input.garmentIds ?? [];
  if (input.lookId) {
    const look = await getLookWithItems(db, input.lookId);
    if (!look) throw new Error(`look not found or deleted: ${input.lookId}`);
    outfitGarmentIds = look.items.map((i) => i.garmentId);
  }
  const existing = input.id ? await db.getTripOutfit(input.id) : null;
  if (existing && existing.deletedAt == null) {
    const id = input.id!;
    await updateTripOutfitRow(db, id, {
      date: input.date,
      timeLabel: input.timeLabel,
      occasion: input.occasion ?? null,
      lookId: input.lookId === undefined ? existing.lookId : input.lookId,
      outfitGarmentIds,
      note: input.note ?? null,
    }, now);
    const to = (await db.getTripOutfit(id))!;
    return toOutfitDetail(db, to);
  }
  const id = input.id ?? uuidv7();
  await createTripOutfit(db, {
    id,
    tripId: input.tripId,
    date: input.date,
    timeLabel: input.timeLabel,
    occasion: input.occasion,
    lookId: input.lookId,
    outfitGarmentIds,
    note: input.note,
    now,
  });
  const to = await db.getTripOutfit(id);
  if (!to) throw new Error(`saveTripOutfit succeeded but row missing: ${id}`);
  return toOutfitDetail(db, to);
}

/** 某旅行全部活动安排（同日多时段，按 (date, createdAt) 升序），各带快照与 lookMissing。 */
export async function listTripOutfitsCore(db: GarmentDb, tripId: string): Promise<TripOutfitDetail[]> {
  const rows = await db.listActiveTripOutfits(tripId);
  return Promise.all(rows.map((to) => toOutfitDetail(db, to)));
}

/** 软删 tripOutfit：仅置墓碑，行保留；绝不动关联造型。 */
export async function deleteTripOutfitCore(db: GarmentDb, id: string): Promise<void> {
  await softDeleteTripOutfit(db, id, Date.now());
}

/**
 * 记录实际已穿：与计划同表分列（worn_status/worn_completed_at/worn_change_note）。
 * 幂等：已 completed/changed 的安排再次记录原样返回，不改 wornCompletedAt。
 */
export async function recordTripOutfitWornCore(
  db: GarmentDb,
  id: string,
  input: RecordTripOutfitWornInput,
): Promise<TripOutfitDetail> {
  const to = await db.getTripOutfit(id);
  if (!to || to.deletedAt != null) throw new Error(`tripOutfit not found or deleted: ${id}`);
  if (to.wornStatus !== 'planned') return toOutfitDetail(db, to); // 幂等
  const now = input.now ?? Date.now();
  if (input.asPlanned) {
    await updateTripOutfitRow(db, id, { wornStatus: 'completed', wornCompletedAt: now }, now);
  } else {
    await updateTripOutfitRow(
      db,
      id,
      { wornStatus: 'changed', wornCompletedAt: now, wornChangeNote: input.changeNote ?? null },
      now,
    );
  }
  return toOutfitDetail(db, (await db.getTripOutfit(id))!);
}

/* ---------------- 设备单例 ---------------- */

const rt = createServiceRuntime();

export async function saveTrip(input: SaveTripInput): Promise<TripDetail> {
  const detail = await saveTripCore((await rt.readyDb()).db, input);
  await rt.persist();
  return detail;
}

export async function getTrip(id: string): Promise<TripDetail | null> {
  return getTripCore((await rt.readyDb()).db, id);
}

export async function listActiveTrips(): Promise<TripDetail[]> {
  return listActiveTripsCore((await rt.readyDb()).db);
}

export async function deleteTrip(id: string): Promise<void> {
  await deleteTripCore((await rt.readyDb()).db, id);
  await rt.persist();
}

export async function updateTripStatus(id: string, status: TripStatus): Promise<void> {
  await updateTripStatusCore((await rt.readyDb()).db, id, status);
  await rt.persist();
}

export async function saveTripOutfit(input: SaveTripOutfitInput): Promise<TripOutfitDetail> {
  const detail = await saveTripOutfitCore((await rt.readyDb()).db, input);
  await rt.persist();
  return detail;
}

export async function listTripOutfits(tripId: string): Promise<TripOutfitDetail[]> {
  return listTripOutfitsCore((await rt.readyDb()).db, tripId);
}

export async function deleteTripOutfit(id: string): Promise<void> {
  await deleteTripOutfitCore((await rt.readyDb()).db, id);
  await rt.persist();
}

export async function recordTripOutfitWorn(id: string, input: RecordTripOutfitWornInput): Promise<TripOutfitDetail> {
  const detail = await recordTripOutfitWornCore((await rt.readyDb()).db, id, input);
  await rt.persist();
  return detail;
}

/** 仅测试/调试：重置单例（不删数据）。 */
export function __resetForTest() {
  rt.resetForTest();
}
