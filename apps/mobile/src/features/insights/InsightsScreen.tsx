import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { hitTarget, palette, radius, spacing, typography } from '@/design-system';
import { todayLocal } from '@/core/plan/calendar';
import { getOverview, type OverviewView } from '@/core/insights/insightsService';
import { TabShell } from '@/features/shell/TabShell';
import { formatAvg, formatRate } from './insightsView';

/**
 * 统计总览（STA-01）：穿着天数、盘活单品、重复率、平均次数、衣橱总数/活跃/归档。
 * 学习期提示「再连续记录几天，洞察会更准确」；主操作「查看久未穿/成本次/月度报告」。
 * 五态覆盖：加载/空/失败/正常/恢复（重启后由镜像回灌 wear_logs 重新实时算）。
 */
export default function InsightsScreen() {
  const router = useRouter();
  const today = todayLocal();
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<OverviewView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    getOverview(Date.now())
      .then((v) => {
        setView(v);
        setError(null);
      })
      .catch(() => setError('洞察加载失败，请重试'))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const o = view?.overview;

  return (
    <TabShell title="衣橱洞察" subtitle={`截至 ${today}`}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {loading && !view ? <Text style={styles.muted}>加载中…</Text> : null}
        {!loading && !view && !error ? <Text style={styles.muted}>暂无数据</Text> : null}

        {o ? (
          <>
            {view?.learningHint ? (
              <View style={styles.learningBox}>
                <Text style={styles.learningTitle}>学习期</Text>
                <Text style={styles.muted}>{view.learningHint}</Text>
              </View>
            ) : null}

            <View style={styles.kpiRow}>
              <View style={styles.kpi}>
                <Text style={styles.kpiValue}>{o.wearDays}</Text>
                <Text style={styles.kpiLabel}>穿着天数</Text>
              </View>
              <View style={styles.kpi}>
                <Text style={styles.kpiValue}>{o.activatedGarments}</Text>
                <Text style={styles.kpiLabel}>盘活单品</Text>
              </View>
              <View style={styles.kpi}>
                <Text style={styles.kpiValue}>{formatRate(o.repeatRate)}</Text>
                <Text style={styles.kpiLabel}>重复率</Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>衣橱构成</Text>
              <View style={styles.compositionRow}>
                <Text style={styles.compositionLabel}>总单品</Text>
                <Text style={styles.compositionValue}>{o.totalGarments}</Text>
              </View>
              <View style={styles.compositionRow}>
                <Text style={styles.compositionLabel}>当前可穿</Text>
                <Text style={styles.compositionValue}>{o.activeGarments}</Text>
              </View>
              <View style={styles.compositionRow}>
                <Text style={styles.compositionLabel}>已归档</Text>
                <Text style={styles.compositionValue}>{o.archivedGarments}</Text>
              </View>
              <View style={styles.compositionRow}>
                <Text style={styles.compositionLabel}>总穿着次数</Text>
                <Text style={styles.compositionValue}>{o.totalWears}</Text>
              </View>
              <View style={styles.compositionRow}>
                <Text style={styles.compositionLabel}>平均穿着次数（盘活单品）</Text>
                <Text style={styles.compositionValue}>{formatAvg(o.avgWearsPerActivated)}</Text>
              </View>
            </View>

            <Text style={styles.caliber}>
              口径：穿着天数按记录日 distinct 计；盘活=穿过≥1 次；重复率=穿过≥2 次 / 盘活单品；
              归档保留历史贡献但不计入当前可穿。
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="查看久未穿"
              onPress={() => router.push('/insights-idle')}
              style={styles.entryBtn}
            >
              <Text style={styles.entryLabel}>久未穿 →</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="查看成本每次"
              onPress={() => router.push('/insights-cost')}
              style={styles.entryBtn}
            >
              <Text style={styles.entryLabel}>成本/次 →</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="查看月度报告"
              onPress={() => router.push('/insights-monthly')}
              style={styles.entryBtn}
            >
              <Text style={styles.entryLabel}>月度报告 →</Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </TabShell>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  errorText: { ...typography.bodySm, color: palette.danger, marginTop: spacing.sm },
  muted: { ...typography.bodySm, color: palette.charcoalSoft, marginTop: spacing.sm },
  learningBox: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: palette.sandSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.mutedGold,
  },
  learningTitle: { ...typography.headline, color: palette.mutedGold, marginBottom: spacing.xxs },
  kpiRow: { flexDirection: 'row', marginTop: spacing.md, gap: spacing.sm },
  kpi: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: palette.sandSoft,
    alignItems: 'center',
  },
  kpiValue: { ...typography.display, color: palette.oxblood },
  kpiLabel: { ...typography.caption, color: palette.charcoalSoft, marginTop: spacing.xxs },
  section: { marginTop: spacing.lg },
  sectionTitle: { ...typography.headline, color: palette.charcoal, marginBottom: spacing.xs },
  compositionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.hairline,
  },
  compositionLabel: { ...typography.bodySm, color: palette.charcoalSoft },
  compositionValue: { ...typography.bodySm, color: palette.charcoal },
  caliber: {
    ...typography.caption,
    color: palette.charcoalSoft,
    marginTop: spacing.md,
    lineHeight: 18,
  },
  entryBtn: {
    minHeight: hitTarget.preferred,
    marginTop: spacing.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.oxblood,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryLabel: { ...typography.body, color: palette.oxblood },
});
