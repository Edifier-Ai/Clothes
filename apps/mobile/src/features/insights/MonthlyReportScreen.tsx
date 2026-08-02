import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { hitTarget, palette, radius, spacing, typography } from '@/design-system';
import { todayLocal } from '@/core/plan/calendar';
import { getMonthlyReport, type MonthlyView } from '@/core/insights/insightsService';
import { TabShell } from '@/features/shell/TabShell';
import { formatAvg, formatRate } from './insightsView';

/**
 * 月度盘活报告（STA-04）：月切换，当月穿着天数/总次数/盘活单品/新组合数；
 * 主操作「分享脱敏报告」——把 ShareableReport 序列化展示，可复制（系统分享面板
 * 由 P1 同步卡处理；P0 仅展示脱敏后的 JSON 字段，证明无原图/价格/备注/定位泄漏）。
 */
export default function MonthlyReportScreen() {
  const today = todayLocal();
  const [ym, setYm] = useState(() => ({
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)),
  }));
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<MonthlyView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showShare, setShowShare] = useState(false);

  const yearMonth = `${ym.year}-${String(ym.month).padStart(2, '0')}`;

  const load = useCallback(() => {
    setLoading(true);
    getMonthlyReport(yearMonth, Date.now())
      .then((v) => {
        setView(v);
        setError(null);
      })
      .catch(() => setError('月度报告加载失败，请重试'))
      .finally(() => setLoading(false));
  }, [yearMonth]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const shiftMonth = (delta: number) => {
    setYm((prev) => {
      const m0 = prev.month - 1 + delta;
      return { year: prev.year + Math.floor(m0 / 12), month: ((m0 % 12) + 12) % 12 + 1 };
    });
    setShowShare(false);
  };

  const m = view?.monthly;

  return (
    <TabShell title="月度报告" subtitle={`${ym.year} 年 ${ym.month} 月`}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <View style={styles.monthRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="上一月" onPress={() => shiftMonth(-1)} style={styles.monthNav}>
            <Text style={styles.monthNavText}>‹</Text>
          </Pressable>
          <Text style={styles.monthTitle}>{yearMonth}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="下一月" onPress={() => shiftMonth(1)} style={styles.monthNav}>
            <Text style={styles.monthNavText}>›</Text>
          </Pressable>
        </View>

        {loading && !view ? <Text style={styles.muted}>加载中…</Text> : null}
        {m ? (
          <>
            <View style={styles.kpiRow}>
              <View style={styles.kpi}>
                <Text style={styles.kpiValue}>{m.wearDays}</Text>
                <Text style={styles.kpiLabel}>穿着天数</Text>
              </View>
              <View style={styles.kpi}>
                <Text style={styles.kpiValue}>{m.totalWears}</Text>
                <Text style={styles.kpiLabel}>总次数</Text>
              </View>
              <View style={styles.kpi}>
                <Text style={styles.kpiValue}>{m.activatedGarments}</Text>
                <Text style={styles.kpiLabel}>盘活单品</Text>
              </View>
              <View style={styles.kpi}>
                <Text style={styles.kpiValue}>{m.newActivatedGarments}</Text>
                <Text style={styles.kpiLabel}>新组合</Text>
              </View>
            </View>

            <Text style={styles.caliber}>
              口径：按 wear_logs.date 的 YYYY-MM 字面量分组（时区安全）；
              新组合 = 当月首次穿上的单品数（该件所有 wear_logs 中最早 date 落在当月）。
            </Text>

            {view.hasLeak ? (
              <View style={styles.leakBox}>
                <Text style={styles.leakText}>脱敏校验失败：分享产物泄漏受保护字段，已停止分享。</Text>
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="分享脱敏报告"
              onPress={() => setShowShare((s) => !s)}
              style={styles.shareBtn}
            >
              <Text style={styles.shareBtnLabel}>{showShare ? '隐藏分享预览' : '分享脱敏报告'}</Text>
            </Pressable>

            {showShare && view ? (
              <View style={styles.shareBox}>
                <Text style={styles.shareTitle}>脱敏分享快照（不含原图/价格/备注/定位）</Text>
                <Text style={styles.shareJson}>{JSON.stringify(view.shareable, null, 2)}</Text>
                <Text style={styles.muted}>
                  重复率 {formatRate(view.shareable.overview.repeatRate)} ·
                  平均 {formatAvg(view.shareable.overview.avgWearsPerActivated)} 次/盘活单品
                </Text>
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </TabShell>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  errorText: { ...typography.bodySm, color: palette.danger, marginTop: spacing.sm },
  muted: { ...typography.caption, color: palette.charcoalSoft, marginTop: spacing.xs },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  monthNav: { minWidth: hitTarget.min, minHeight: hitTarget.min, alignItems: 'center', justifyContent: 'center' },
  monthNavText: { ...typography.title, color: palette.charcoal },
  monthTitle: { ...typography.headline, color: palette.charcoal },
  kpiRow: { flexDirection: 'row', marginTop: spacing.md, gap: spacing.xs },
  kpi: {
    flex: 1,
    padding: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: palette.sandSoft,
    alignItems: 'center',
  },
  kpiValue: { ...typography.headline, color: palette.oxblood },
  kpiLabel: { ...typography.caption, color: palette.charcoalSoft, marginTop: 2, textAlign: 'center' },
  caliber: {
    ...typography.caption,
    color: palette.charcoalSoft,
    marginTop: spacing.md,
    lineHeight: 18,
  },
  leakBox: {
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: palette.danger,
  },
  leakText: { ...typography.bodySm, color: palette.white },
  shareBtn: {
    minHeight: hitTarget.preferred,
    marginTop: spacing.md,
    borderRadius: radius.md,
    backgroundColor: palette.oxblood,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareBtnLabel: { ...typography.body, color: palette.white },
  shareBox: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: palette.sandSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
  },
  shareTitle: { ...typography.bodySm, color: palette.charcoal, marginBottom: spacing.xs },
  shareJson: {
    ...typography.caption,
    color: palette.charcoal,
    fontFamily: 'monospace',
    lineHeight: 16,
  },
});
