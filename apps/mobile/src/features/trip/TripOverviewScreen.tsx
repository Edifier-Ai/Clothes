import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { hitTarget, palette, radius, spacing, typography } from '@/design-system';
import type { LookDetail, TripDetail, TripOutfitDetail } from '@/core/db/dao';
import { originalUri } from '@/core/files/uri';
import { addDays, weekdayMondayFirst } from '@/core/plan/calendar';
import { listActiveGarmentsWithThumbs } from '@/core/garments/service';
import { listLooks } from '@/core/looks/lookService';
import {
  deleteTrip,
  getTrip,
  listTripOutfits,
  updateTripStatus,
} from '@/core/trip/tripService';

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
const STATUS_LABEL: Record<string, string> = {
  planning: '计划中',
  ongoing: '进行中',
  completed: '已结束',
  archived: '已归档',
};
const STATUS_FLOW = ['planning', 'ongoing', 'completed', 'archived'] as const;

export interface TripOverviewScreenProps {
  id: string;
}

/**
 * 旅行总览（TRP-03）：旅行信息卡 + 每日造型安排列表（按日期分组，同日多时段），
 * 主操作「安排造型」「生成打包清单」「复盘」。状态机切换：planning → ongoing → completed → archived。
 * 失败/加载/空态（无安排时提示去安排造型）全覆盖。
 */
export default function TripOverviewScreen({ id }: TripOverviewScreenProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [outfits, setOutfits] = useState<TripOutfitDetail[]>([]);
  const [looks, setLooks] = useState<LookDetail[]>([]);
  const [thumbs, setThumbs] = useState<Map<string, string | null>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([getTrip(id), listTripOutfits(id), listLooks(), listActiveGarmentsWithThumbs()])
      .then(([t, o, l, g]) => {
        if (!t) {
          setNotFound(true);
          return;
        }
        setTrip(t);
        setOutfits(o);
        setLooks(l);
        setThumbs(new Map(g.map((row) => [row.garment.id, row.imageRelPath])));
        setError(null);
      })
      .catch(() => setError('旅行加载失败，请重试'))
      .finally(() => setLoading(false));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const days = useMemo(() => {
    if (!trip) return [] as string[];
    const out: string[] = [];
    let cur = trip.trip.startDate;
    const end = trip.trip.endDate;
    let guard = 0;
    while (cur <= end && guard < 366) {
      out.push(cur);
      cur = addDays(cur, 1);
      guard += 1;
    }
    return out;
  }, [trip]);

  const outfitsByDate = useMemo(() => {
    const m = new Map<string, TripOutfitDetail[]>();
    for (const o of outfits) {
      const arr = m.get(o.tripOutfit.date) ?? [];
      arr.push(o);
      m.set(o.tripOutfit.date, arr);
    }
    return m;
  }, [outfits]);

  const lookName = (id: string | null) => (id ? looks.find((l) => l.look.id === id)?.look.name ?? null : null);

  const shiftStatus = async () => {
    if (!trip) return;
    const idx = STATUS_FLOW.indexOf(trip.trip.status as (typeof STATUS_FLOW)[number]);
    const next = STATUS_FLOW[Math.min(idx + 1, STATUS_FLOW.length - 1)];
    try {
      await updateTripStatus(trip.trip.id, next);
      load();
    } catch {
      setError('状态切换失败，请重试');
    }
  };

  const remove = async () => {
    if (!trip) return;
    try {
      await deleteTrip(trip.trip.id);
      router.back();
    } catch {
      setError('删除失败，请重试');
    }
  };

  if (notFound) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>旅行不存在或已删除</Text>
      </View>
    );
  }
  if (loading && !trip) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>加载中…</Text>
      </View>
    );
  }
  if (!trip) return null;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scroll}>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.headCard}>
        <Text style={styles.tripName}>{trip.trip.name}</Text>
        <Text style={styles.tripMeta}>
          {trip.trip.destination} · {trip.trip.startDate} ~ {trip.trip.endDate} · {trip.trip.timeZone}
        </Text>
        <View style={styles.statusRow}>
          <Text style={styles.statusBadge}>{STATUS_LABEL[trip.trip.status] ?? trip.trip.status}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="切换旅行状态"
            onPress={() => void shiftStatus()}
            style={styles.statusShiftBtn}
          >
            <Text style={styles.statusShiftLabel}>推进状态 →</Text>
          </Pressable>
        </View>
        {trip.weatherSnapshot ? (
          <Text style={styles.weatherText}>
            天气：{trip.weatherSnapshot.cityName} {trip.weatherSnapshot.minTempC}–{trip.weatherSnapshot.maxTempC}°C
          </Text>
        ) : (
          <Text style={styles.weatherText}>天气：暂未获取，不阻塞旅行</Text>
        )}
      </View>

      <View style={styles.actionRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="生成或刷新打包清单"
          onPress={() => router.push({ pathname: '/trip-packing/[tripId]', params: { tripId: id } })}
          style={styles.primaryBtn}
        >
          <Text style={styles.primaryBtnLabel}>打包清单</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="旅行复盘"
          onPress={() => router.push({ pathname: '/trip-review/[tripId]', params: { tripId: id } })}
          style={styles.ghostBtn}
        >
          <Text style={styles.ghostBtnLabel}>复盘</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>每日造型</Text>
      {days.length === 0 ? (
        <Text style={styles.muted}>日期范围无效</Text>
      ) : (
        days.map((date) => {
          const arr = outfitsByDate.get(date) ?? [];
          const isToday = false; // 旅行日历不显眼标今天，避免与今日页混淆
          return (
            <View key={date} style={styles.dayCard}>
              <View style={styles.dayHead}>
                <Text style={styles.dayTitle}>
                  {Number(date.slice(5, 7))} 月 {Number(date.slice(8, 10))} 日 · 周{WEEKDAYS[weekdayMondayFirst(date)]}
                  {isToday ? ' · 今天' : ''}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`为 ${date} 安排造型`}
                  onPress={() => router.push({ pathname: '/trip-day', params: { tripId: id, date } })}
                  style={styles.dayAddBtn}
                >
                  <Text style={styles.dayAddLabel}>+ 安排</Text>
                </Pressable>
              </View>
              {arr.length === 0 ? (
                <Text style={styles.muted}>尚未安排造型</Text>
              ) : (
                arr.map((o) => {
                  const ln = lookName(o.tripOutfit.lookId);
                  return (
                    <Pressable
                      key={o.tripOutfit.id}
                      accessibilityRole="button"
                      accessibilityLabel={`编辑 ${date} ${o.tripOutfit.timeLabel} 安排`}
                      onPress={() => router.push({ pathname: '/trip-day', params: { tripId: id, date, outfitId: o.tripOutfit.id } })}
                      style={styles.outfitRow}
                    >
                      <View style={styles.outfitInfo}>
                        <Text style={styles.outfitTitle}>
                          {o.tripOutfit.timeLabel}
                          {ln ? ` · ${ln}` : ''}
                        </Text>
                        {o.lookMissing ? (
                          <Text style={styles.missingText}>关联造型已删除，快照保留</Text>
                        ) : null}
                        {o.tripOutfit.wornStatus !== 'planned' ? (
                          <Text style={styles.wornBadge}>
                            {o.tripOutfit.wornStatus === 'completed' ? '已穿' : '有变化'}
                          </Text>
                        ) : null}
                      </View>
                      <View style={styles.thumbRow}>
                        {o.outfitGarmentIds.slice(0, 4).map((gid) => {
                          const rel = thumbs.get(gid);
                          return rel ? (
                            <Image key={gid} source={{ uri: originalUri(rel) }} style={styles.thumb} contentFit="cover" />
                          ) : (
                            <View key={gid} style={[styles.thumb, styles.thumbBlank]} />
                          );
                        })}
                      </View>
                    </Pressable>
                  );
                })
              )}
            </View>
          );
        })
      )}

      <View style={styles.footerRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="编辑旅行信息"
          onPress={() => router.push({ pathname: '/trip-edit', params: { id } })}
          style={styles.footerBtn}
        >
          <Text style={styles.footerBtnLabel}>编辑</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="删除旅行"
          onPress={() => void remove()}
          style={styles.footerBtn}
        >
          <Text style={[styles.footerBtnLabel, styles.dangerLabel]}>删除</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.paperWhite },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: palette.paperWhite },
  muted: { ...typography.bodySm, color: palette.charcoalSoft },
  errorText: { ...typography.bodySm, color: palette.danger, marginBottom: spacing.sm },
  headCard: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: palette.sandSoft,
  },
  tripName: { ...typography.title, color: palette.charcoal },
  tripMeta: { ...typography.bodySm, color: palette.charcoalSoft, marginTop: spacing.xxs },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  statusBadge: {
    ...typography.caption,
    color: palette.oxblood,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.oxblood,
  },
  statusShiftBtn: { minHeight: hitTarget.min, justifyContent: 'center' },
  statusShiftLabel: { ...typography.caption, color: palette.oxblood },
  weatherText: { ...typography.caption, color: palette.charcoalSoft, marginTop: spacing.xs },
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  primaryBtn: {
    flex: 1,
    minHeight: hitTarget.preferred,
    borderRadius: radius.md,
    backgroundColor: palette.oxblood,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnLabel: { ...typography.body, color: palette.white },
  ghostBtn: {
    flex: 1,
    minHeight: hitTarget.preferred,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.oxblood,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostBtnLabel: { ...typography.body, color: palette.oxblood },
  sectionTitle: { ...typography.headline, color: palette.charcoal, marginTop: spacing.lg, marginBottom: spacing.xs },
  dayCard: {
    marginTop: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: palette.sandSoft,
  },
  dayHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayTitle: { ...typography.body, color: palette.charcoal, flex: 1 },
  dayAddBtn: { minHeight: hitTarget.min, justifyContent: 'center', paddingHorizontal: spacing.sm },
  dayAddLabel: { ...typography.bodySm, color: palette.oxblood },
  outfitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    paddingVertical: spacing.xs,
  },
  outfitInfo: { flex: 1 },
  outfitTitle: { ...typography.bodySm, color: palette.charcoal },
  missingText: { ...typography.caption, color: palette.danger, marginTop: spacing.xxs },
  wornBadge: { ...typography.caption, color: palette.oxblood, marginTop: spacing.xxs },
  thumbRow: { flexDirection: 'row', gap: 4 },
  thumb: { width: 36, height: 48, borderRadius: radius.sm, backgroundColor: palette.paperWhite },
  thumbBlank: { borderWidth: StyleSheet.hairlineWidth, borderColor: palette.hairline },
  footerRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.lg, gap: spacing.md },
  footerBtn: { minHeight: hitTarget.min, justifyContent: 'center', paddingHorizontal: spacing.sm },
  footerBtnLabel: { ...typography.bodySm, color: palette.charcoalSoft },
  dangerLabel: { color: palette.danger },
});
