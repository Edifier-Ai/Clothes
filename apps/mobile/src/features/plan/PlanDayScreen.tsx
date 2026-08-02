import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { hitTarget, palette, radius, spacing, typography } from '@/design-system';
import { planOutfitIds, type LookDetail } from '@/core/db/dao';
import type { PlanRow } from '@/core/db/schema';
import { listActiveGarmentsWithThumbs } from '@/core/garments/service';
import { originalUri } from '@/core/files/uri';
import { todayLocal, weekdayMondayFirst } from '@/core/plan/calendar';
import { deletePlan, plansForDate, recordWorn } from '@/core/plan/planService';
import { listLooks } from '@/core/looks/lookService';

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
const OCCASION_LABEL: Record<string, string> = {
  commute: '通勤',
  formal: '正式',
  casual: '休闲',
  dinner: '晚餐',
  travel: '旅行',
};

/**
 * 日期详情（PLN-02）：当日全部计划（工作/晚餐多时段各自独立），
 * 每项含时间段、场合、单品缩略图、备注与已穿状态；主操作「记录已穿」
 * （按计划 / 有变化分开记录），另有编辑、删除（墓碑可恢复）。
 * 关联造型被删时保留快照并给出修复入口（重新选择造型）。
 */
export default function PlanDayScreen({ date }: { date: string }) {
  const router = useRouter();
  const today = todayLocal();
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [looks, setLooks] = useState<LookDetail[]>([]);
  const [thumbs, setThumbs] = useState<Map<string, string | null>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [changeFor, setChangeFor] = useState<string | null>(null);
  const [changeText, setChangeText] = useState('');

  const load = useCallback(() => {
    Promise.all([plansForDate(date), listLooks(), listActiveGarmentsWithThumbs()])
      .then(([p, l, g]) => {
        setPlans(p);
        setLooks(l);
        setThumbs(new Map(g.map((row) => [row.garment.id, row.imageRelPath])));
        setError(null);
      })
      .catch(() => setError('计划加载失败，请重试'));
  }, [date]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const lookOf = (id: string | null) => (id ? looks.find((l) => l.look.id === id) : undefined);

  const mark = async (plan: PlanRow, asPlanned: boolean, changeNote?: string) => {
    try {
      await recordWorn(plan.id, { asPlanned, changeNote });
      setChangeFor(null);
      setChangeText('');
      load();
    } catch {
      setError('记录失败，请重试');
    }
  };

  const remove = async (plan: PlanRow) => {
    try {
      await deletePlan(plan.id); // 墓碑，可恢复；绝不动造型本身
      load();
    } catch {
      setError('删除失败，请重试');
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>
        {Number(date.slice(5, 7))} 月 {Number(date.slice(8, 10))} 日 · 周{WEEKDAYS[weekdayMondayFirst(date)]}
        {date === today ? ' · 今天' : ''}
      </Text>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {plans.length === 0 && !error ? <Text style={styles.muted}>这一天还没有计划</Text> : null}

      {plans.map((p) => {
        const look = lookOf(p.lookId);
        const lookMissing = p.lookId != null && !look;
        const outfitIds = planOutfitIds(p);
        return (
          <View key={p.id} style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>
                {p.timeLabel}
                {p.occasion ? ` · ${OCCASION_LABEL[p.occasion] ?? p.occasion}` : ''}
              </Text>
              {p.status !== 'planned' ? (
                <Text style={styles.wornBadge}>{p.status === 'completed' ? '已穿' : '有变化'}</Text>
              ) : null}
            </View>
            {look ? <Text style={styles.lookName}>造型：{look.look.name}</Text> : null}
            {lookMissing ? (
              <View style={styles.missingRow}>
                <Text style={styles.missingText}>关联造型已删除，快照保留</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="修复计划"
                  onPress={() => router.push({ pathname: '/plan-edit', params: { id: p.id } })}
                  style={styles.repairBtn}
                >
                  <Text style={styles.repairLabel}>重新选择造型</Text>
                </Pressable>
              </View>
            ) : null}
            <View style={styles.thumbRow}>
              {outfitIds.map((gid) => {
                const rel = thumbs.get(gid);
                return rel ? (
                  <Image key={gid} source={{ uri: originalUri(rel) }} style={styles.thumb} contentFit="cover" />
                ) : (
                  <View key={gid} style={[styles.thumb, styles.thumbBlank]} />
                );
              })}
            </View>
            {p.note ? <Text style={styles.note}>备注：{p.note}</Text> : null}
            {p.status === 'changed' && p.changeNote ? (
              <Text style={styles.note}>变化：{p.changeNote}</Text>
            ) : null}

            {p.status === 'planned' ? (
              <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`记录已穿 ${p.timeLabel}`}
                  onPress={() => void mark(p, true)}
                  style={styles.primaryBtn}
                >
                  <Text style={styles.primaryBtnLabel}>记录已穿</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`计划有变化 ${p.timeLabel}`}
                  onPress={() => {
                    setChangeFor(changeFor === p.id ? null : p.id);
                    setChangeText('');
                  }}
                  style={styles.ghostBtn}
                >
                  <Text style={styles.ghostBtnLabel}>有变化</Text>
                </Pressable>
              </View>
            ) : null}
            {changeFor === p.id ? (
              <View style={styles.changeBox}>
                <TextInput
                  value={changeText}
                  onChangeText={setChangeText}
                  placeholder="实际穿了什么变化？"
                  placeholderTextColor={palette.charcoalSoft}
                  style={styles.changeInput}
                  testID={`change-note-${p.id}`}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="确认记录变化"
                  onPress={() => void mark(p, false, changeText.trim() || undefined)}
                  style={styles.primaryBtn}
                >
                  <Text style={styles.primaryBtnLabel}>记录</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.footerRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`编辑计划 ${p.timeLabel}`}
                onPress={() => router.push({ pathname: '/plan-edit', params: { id: p.id } })}
                style={styles.footerBtn}
              >
                <Text style={styles.footerBtnLabel}>编辑</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`删除计划 ${p.timeLabel}`}
                onPress={() => void remove(p)}
                style={styles.footerBtn}
              >
                <Text style={[styles.footerBtnLabel, styles.dangerLabel]}>删除</Text>
              </Pressable>
            </View>
          </View>
        );
      })}

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/plan-edit', params: { date } })}
        style={styles.addBtn}
      >
        <Text style={styles.addBtnLabel}>添加计划</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.paperWhite },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { ...typography.headline, color: palette.charcoal },
  muted: { ...typography.body, color: palette.charcoalSoft, marginTop: spacing.md },
  errorText: { ...typography.bodySm, color: palette.danger, marginTop: spacing.sm },
  card: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: palette.sandSoft,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { ...typography.headline, color: palette.charcoal },
  wornBadge: { ...typography.caption, color: palette.oxblood },
  lookName: { ...typography.bodySm, color: palette.charcoalSoft, marginTop: spacing.xxs },
  missingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs },
  missingText: { ...typography.caption, color: palette.danger, flex: 1 },
  repairBtn: { minHeight: hitTarget.min, justifyContent: 'center', paddingHorizontal: spacing.sm },
  repairLabel: { ...typography.bodySm, color: palette.oxblood },
  thumbRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm },
  thumb: { width: 48, height: 64, borderRadius: radius.sm, backgroundColor: palette.paperWhite },
  thumbBlank: { borderWidth: StyleSheet.hairlineWidth, borderColor: palette.hairline },
  note: { ...typography.bodySm, color: palette.charcoalSoft, marginTop: spacing.xs },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  primaryBtn: {
    minHeight: hitTarget.preferred,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: palette.oxblood,
    justifyContent: 'center',
  },
  primaryBtnLabel: { ...typography.bodySm, color: palette.white },
  ghostBtn: {
    minHeight: hitTarget.preferred,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.oxblood,
    justifyContent: 'center',
  },
  ghostBtnLabel: { ...typography.bodySm, color: palette.oxblood },
  changeBox: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, alignItems: 'center' },
  changeInput: {
    flex: 1,
    minHeight: hitTarget.preferred,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: palette.paperWhite,
    ...typography.bodySm,
    color: palette.charcoal,
  },
  footerRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.xs },
  footerBtn: { minHeight: hitTarget.min, justifyContent: 'center', paddingHorizontal: spacing.sm },
  footerBtnLabel: { ...typography.bodySm, color: palette.charcoalSoft },
  dangerLabel: { color: palette.danger },
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
