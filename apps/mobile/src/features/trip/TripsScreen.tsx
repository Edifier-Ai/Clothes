import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { hitTarget, palette, radius, spacing, typography } from '@/design-system';
import type { TripDetail } from '@/core/db/dao';
import { listActiveTrips } from '@/core/trip/tripService';
import { TabShell } from '@/features/shell/TabShell';
import { tripsByStatus, type TripStatusView } from '@/core/trip/packView';

const STATUS_LABEL: Record<TripStatusView['status'], string> = {
  planning: '计划中',
  ongoing: '进行中',
  completed: '已结束',
  archived: '已归档',
};
const STATUS_ORDER: TripStatusView['status'][] = ['ongoing', 'planning', 'completed', 'archived'];

/**
 * 旅行列表（TRP-01）：按状态分组的活动旅行；主操作「新建旅行」。
 * 五态覆盖：加载/空/失败/正常/恢复（重启后由镜像回灌恢复）。
 * 入口在 PlanScreen 顶部，本页是 (tabs) 之外的路由页。
 */
export default function TripsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState<TripDetail[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    listActiveTrips()
      .then((rows) => {
        setTrips(rows);
        setError(null);
      })
      .catch(() => setError('旅行加载失败，请重试'))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const grouped = tripsByStatus(
    trips.map<TripStatusView>((t) => ({
      id: t.trip.id,
      status: t.trip.status as TripStatusView['status'],
      name: t.trip.name,
    })),
  );

  return (
    <TabShell title="旅行" subtitle="按状态分组的旅行打包">
      <ScrollView contentContainerStyle={styles.scroll}>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {loading && trips.length === 0 ? <Text style={styles.muted}>加载中…</Text> : null}
        {!loading && trips.length === 0 && !error ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>还没有旅行</Text>
            <Text style={styles.muted}>新建一次旅行，安排每日造型，自动生成去重打包清单。</Text>
          </View>
        ) : null}

        {STATUS_ORDER.map((status) => {
          const list = grouped[status];
          if (list.length === 0) return null;
          return (
            <View key={status} style={styles.section}>
              <Text style={styles.sectionTitle}>{STATUS_LABEL[status]} · {list.length}</Text>
              {trips
                .filter((t) => t.trip.status === status)
                .map((t) => (
                  <Pressable
                    key={t.trip.id}
                    accessibilityRole="button"
                    accessibilityLabel={`打开旅行 ${t.trip.name}`}
                    onPress={() => router.push({ pathname: '/trip/[id]', params: { id: t.trip.id } })}
                    style={styles.tripCard}
                  >
                    <Text style={styles.tripName} numberOfLines={1}>{t.trip.name}</Text>
                    <Text style={styles.tripMeta} numberOfLines={1}>
                      {t.trip.destination} · {t.trip.startDate} ~ {t.trip.endDate}
                    </Text>
                    {t.activities.length > 0 ? (
                      <Text style={styles.tripAct} numberOfLines={1}>
                        {t.activities.length} 项活动安排
                      </Text>
                    ) : null}
                  </Pressable>
                ))}
            </View>
          );
        })}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="新建旅行"
          onPress={() => router.push('/trip-edit')}
          style={styles.addBtn}
        >
          <Text style={styles.addBtnLabel}>新建旅行</Text>
        </Pressable>
      </ScrollView>
    </TabShell>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  errorText: { ...typography.bodySm, color: palette.danger, marginTop: spacing.sm },
  muted: { ...typography.bodySm, color: palette.charcoalSoft },
  emptyBox: { marginTop: spacing.xl, alignItems: 'center', paddingHorizontal: spacing.lg },
  emptyTitle: { ...typography.headline, color: palette.charcoal, marginBottom: spacing.xs },
  section: { marginTop: spacing.lg },
  sectionTitle: { ...typography.caption, color: palette.charcoalSoft, marginBottom: spacing.xs },
  tripCard: {
    minHeight: hitTarget.preferred,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: palette.sandSoft,
    marginTop: spacing.xs,
  },
  tripName: { ...typography.headline, color: palette.charcoal },
  tripMeta: { ...typography.bodySm, color: palette.charcoalSoft, marginTop: spacing.xxs },
  tripAct: { ...typography.caption, color: palette.mutedGold, marginTop: spacing.xxs },
  addBtn: {
    minHeight: hitTarget.preferred,
    marginTop: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: palette.oxblood,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnLabel: { ...typography.body, color: palette.white },
});
