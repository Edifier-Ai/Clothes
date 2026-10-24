import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { hitTarget, palette, radius, spacing, typography } from '@/design-system';
import type { LookDetail } from '@/core/db/dao';
import type { PlanRow } from '@/core/db/schema';
import { listActiveGarmentsWithThumbs } from '@/core/garments/service';
import { originalUri } from '@/core/files/uri';
import { monthGrid, monthRangeOf, todayLocal, weekdayMondayFirst } from '@/core/plan/calendar';
import { listPlansInRange } from '@/core/plan/planService';
import { listLooks } from '@/core/looks/lookService';
import { TabShell } from '@/features/shell/TabShell';
import { monthStats, planThumbRelPath, plansByDate } from './planView';

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
const OCCASION_LABEL: Record<string, string> = {
  commute: '通勤',
  formal: '正式',
  casual: '休闲',
  dinner: '晚餐',
  travel: '旅行',
};

/**
 * 计划月历（PLN-01）：周一开头月历、每日真实造型缩略图、今天高亮、
 * 选中日的计划摘要、本月记录统计；主操作「添加计划」。
 * 日期全部走当地日期字面量（calendar.ts），时区切换不偏移。
 */
export default function PlanScreen() {
  const router = useRouter();
  const today = todayLocal();
  const [ym, setYm] = useState(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) }));
  const [selected, setSelected] = useState(today);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [looks, setLooks] = useState<LookDetail[]>([]);
  const [garmentThumbs, setGarmentThumbs] = useState<Map<string, string | null>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const { start, end } = monthRangeOf(ym.year, ym.month);
    Promise.all([listPlansInRange(start, end), listLooks(), listActiveGarmentsWithThumbs()])
      .then(([p, l, g]) => {
        setPlans(p);
        setLooks(l);
        setGarmentThumbs(new Map(g.map((row) => [row.garment.id, row.imageRelPath])));
        setError(null);
      })
      .catch(() => setError('计划加载失败，请重试'));
  }, [ym]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const cells = useMemo(() => monthGrid(ym.year, ym.month), [ym]);
  const byDate = useMemo(() => plansByDate(plans), [plans]);
  const stats = useMemo(
    () => monthStats(plans, `${ym.year}-${String(ym.month).padStart(2, '0')}`, today),
    [plans, ym, today],
  );
  const lookCover = useCallback(
    (lookId: string) => looks.find((l) => l.look.id === lookId)?.look.coverRelPath ?? null,
    [looks],
  );
  const thumbOf = useCallback(
    (plan: PlanRow) => planThumbRelPath(plan, lookCover, (gid) => garmentThumbs.get(gid) ?? null),
    [lookCover, garmentThumbs],
  );
  const selectedPlans = byDate.get(selected) ?? [];

  const shiftMonth = (delta: number) => {
    setYm((prev) => {
      const m0 = prev.month - 1 + delta;
      return { year: prev.year + Math.floor(m0 / 12), month: ((m0 % 12) + 12) % 12 + 1 };
    });
  };

  return (
    <TabShell title="计划" subtitle="日历 · 旅行">
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="进入旅行打包"
          onPress={() => router.push('/trips')}
          style={styles.tripEntryBtn}
        >
          <Text style={styles.tripEntryLabel}>旅行打包 →</Text>
        </Pressable>
        <View style={styles.monthRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="上一月" onPress={() => shiftMonth(-1)} style={styles.monthNav}>
            <Text style={styles.monthNavText}>‹</Text>
          </Pressable>
          <Text style={styles.monthTitle}>
            {ym.year} 年 {ym.month} 月
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="下一月" onPress={() => shiftMonth(1)} style={styles.monthNav}>
            <Text style={styles.monthNavText}>›</Text>
          </Pressable>
        </View>

        <View style={styles.weekRow}>
          {WEEKDAYS.map((w) => (
            <Text key={w} style={styles.weekLabel}>
              {w}
            </Text>
          ))}
        </View>

        <View style={styles.grid}>
          {cells.map((cell) => {
            const dayPlans = byDate.get(cell.date) ?? [];
            const isToday = cell.date === today;
            const isSelected = cell.date === selected;
            return (
              <Pressable
                key={cell.date}
                accessibilityRole="button"
                accessibilityLabel={`日期 ${cell.date}${isToday ? '，今天' : ''}${dayPlans.length > 0 ? `，${dayPlans.length} 项计划` : ''}`}
                onPress={() => {
                  setSelected(cell.date);
                  if (!cell.inMonth) setYm({ year: Number(cell.date.slice(0, 4)), month: Number(cell.date.slice(5, 7)) });
                }}
                style={[styles.cell, isSelected && styles.cellSelected]}
              >
                <View style={[styles.dayBadge, isToday && styles.dayBadgeToday]}>
                  <Text
                    style={[
                      styles.dayNum,
                      !cell.inMonth && styles.dayNumSpill,
                      isToday && styles.dayNumToday,
                    ]}
                  >
                    {Number(cell.date.slice(8, 10))}
                  </Text>
                </View>
                <View style={styles.thumbRow}>
                  {dayPlans.slice(0, 2).map((p) => {
                    const rel = thumbOf(p);
                    return rel ? (
                      <Image key={p.id} source={{ uri: originalUri(rel) }} style={styles.thumb} contentFit="cover" />
                    ) : (
                      <View key={p.id} style={[styles.thumb, styles.thumbBlank]}>
                        <View style={styles.thumbMark} />
                      </View>
                    );
                  })}
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.daySection}>
          <Text style={styles.dayTitle}>
            {Number(selected.slice(5, 7))} 月 {Number(selected.slice(8, 10))} 日
            {selected === today ? ' · 今天' : ''} · 周{WEEKDAYS[weekdayMondayFirst(selected)]}
          </Text>
          {selectedPlans.length === 0 ? (
            <Text style={styles.dayEmpty}>这一天还没有计划</Text>
          ) : (
            selectedPlans.map((p) => (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                onPress={() => router.push(`/plan/${p.date}`)}
                style={styles.planCard}
              >
                <Text style={styles.planTitle}>
                  {p.timeLabel}
                  {p.occasion ? ` · ${OCCASION_LABEL[p.occasion] ?? p.occasion}` : ''}
                </Text>
                {p.status !== 'planned' ? (
                  <Text style={styles.planWorn}>{p.status === 'completed' ? '已穿' : '有变化'}</Text>
                ) : null}
              </Pressable>
            ))
          )}
          <Text style={styles.statsLine}>
            本月已记录 {stats.recordedDays} 天 · 连续 {stats.streak} 天
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/plan-edit', params: { date: selected } })}
          style={styles.addBtn}
        >
          <Text style={styles.addBtnLabel}>添加计划</Text>
        </Pressable>
      </ScrollView>
    </TabShell>
  );
}

const styles = StyleSheet.create({
  errorText: { ...typography.bodySm, color: palette.danger, paddingHorizontal: spacing.lg },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  tripEntryBtn: {
    minHeight: hitTarget.preferred,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.oxblood,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripEntryLabel: { ...typography.body, color: palette.oxblood },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  monthNav: { minWidth: hitTarget.min, minHeight: hitTarget.min, alignItems: 'center', justifyContent: 'center' },
  monthNavText: { ...typography.title, color: palette.charcoal },
  monthTitle: { ...typography.headline, color: palette.charcoal },
  weekRow: { flexDirection: 'row', marginTop: spacing.xs },
  weekLabel: { flex: 1, textAlign: 'center', ...typography.caption, color: palette.charcoalSoft },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.xxs },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 0.72,
    alignItems: 'center',
    paddingTop: spacing.xxs,
    borderRadius: radius.sm,
  },
  cellSelected: { backgroundColor: palette.sandSoft },
  dayBadge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dayBadgeToday: { backgroundColor: palette.oxblood },
  dayNum: { ...typography.bodySm, color: palette.charcoal },
  dayNumSpill: { color: palette.hairline },
  dayNumToday: { color: palette.white },
  thumbRow: { flexDirection: 'row', gap: 2, marginTop: 2 },
  thumb: { width: 22, height: 30, borderRadius: 3, backgroundColor: palette.sandSoft },
  thumbBlank: { borderWidth: StyleSheet.hairlineWidth, borderColor: palette.hairline, alignItems: 'center', justifyContent: 'center' },
  thumbMark: { width: 8, height: 12, borderRadius: 2, backgroundColor: palette.mutedGold },
  daySection: { marginTop: spacing.md },
  dayTitle: { ...typography.headline, color: palette.charcoal },
  dayEmpty: { ...typography.bodySm, color: palette.charcoalSoft, marginTop: spacing.xs },
  planCard: {
    minHeight: hitTarget.preferred,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: palette.sandSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  planTitle: { ...typography.body, color: palette.charcoal },
  planWorn: { ...typography.caption, color: palette.oxblood },
  statsLine: { ...typography.caption, color: palette.charcoalSoft, marginTop: spacing.sm, textAlign: 'center' },
  addBtn: {
    minHeight: hitTarget.preferred,
    marginTop: spacing.md,
    borderRadius: radius.md,
    backgroundColor: palette.oxblood,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnLabel: { ...typography.body, color: palette.white },
});
