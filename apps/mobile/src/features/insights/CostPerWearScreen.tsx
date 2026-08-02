import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { hitTarget, palette, radius, spacing, typography } from '@/design-system';
import { getCostPerWearList, listGarmentThumbs, type CostPerWearView } from '@/core/insights/insightsService';
import { originalUri } from '@/core/files/uri';
import { TabShell } from '@/features/shell/TabShell';
import { CATEGORY_LABEL, formatCostPerWear, formatPrice } from './insightsView';

/**
 * 成本/次（STA-03）：单品排行（最划算在前），展示购买价/穿着次数/成本/次。
 * 0 次或无价为 null，UI 显示原因（未填价格/还未穿过），不显示假数字。
 * 主操作「查看单品」跳详情。
 */
export default function CostPerWearScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<CostPerWearView | null>(null);
  const [thumbs, setThumbs] = useState<Map<string, string | null>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([getCostPerWearList(), listGarmentThumbs()])
      .then(([v, t]) => {
        setView(v);
        setThumbs(t);
        setError(null);
      })
      .catch(() => setError('成本/次加载失败，请重试'))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <TabShell title="成本/次" subtitle="按价值排序 · 越穿越划算">
      <ScrollView contentContainerStyle={styles.scroll}>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {loading && !view ? <Text style={styles.muted}>加载中…</Text> : null}
        {!loading && view && view.rows.length === 0 && !error ? (
          <Text style={styles.muted}>还没有衣物。添加衣物并填购买价后，这里会显示成本/次。</Text>
        ) : null}

        {view?.rows.map((row, idx) => {
          const g = view.garmentRows.get(row.garmentId);
          const rel = thumbs.get(row.garmentId) ?? null;
          const priceText = formatPrice(row.priceMinor);
          return (
            <Pressable
              key={row.garmentId}
              accessibilityRole="button"
              accessibilityLabel={`查看单品 ${g?.name ?? row.garmentId}`}
              onPress={() => router.push(`/garment/${row.garmentId}`)}
              style={styles.row}
            >
              <View style={styles.rowMain}>
                <Text style={styles.rank}>{idx + 1}</Text>
                {rel ? (
                  <Image source={{ uri: originalUri(rel) }} style={styles.thumb} contentFit="contain" />
                ) : (
                  <View style={[styles.thumb, styles.thumbBlank]} />
                )}
                <View style={styles.meta}>
                  <Text style={styles.name} numberOfLines={1}>{g?.name ?? row.garmentId}</Text>
                  <Text style={styles.cat}>
                    {CATEGORY_LABEL[row.category] ?? row.category}
                    {row.archived ? ' · 已归档' : ''}
                  </Text>
                </View>
                <View style={styles.nums}>
                  <Text style={styles.cost}>{formatCostPerWear(row)}</Text>
                  <Text style={styles.sub}>
                    {priceText ? `¥${priceText}` : '未填价格'} · 穿 {row.timesWorn} 次
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        })}

        <Text style={styles.caliber}>
          口径：成本/次 = 购买价 ÷ 有效穿着次数（向下取整到分）。
          仅价格&gt;0 且穿过≥1 次时计算，否则显示原因，绝不除零或伪造数值。
          归档衣物保留显示（历史贡献可见）。
        </Text>
      </ScrollView>
    </TabShell>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  errorText: { ...typography.bodySm, color: palette.danger, marginTop: spacing.sm },
  muted: { ...typography.bodySm, color: palette.charcoalSoft, marginTop: spacing.sm },
  row: {
    minHeight: hitTarget.preferred,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: palette.sandSoft,
    marginTop: spacing.xs,
  },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rank: { ...typography.headline, color: palette.mutedGold, width: 24, textAlign: 'center' },
  thumb: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: palette.white },
  thumbBlank: { borderWidth: StyleSheet.hairlineWidth, borderColor: palette.hairline },
  meta: { flex: 1, minWidth: 0 },
  name: { ...typography.body, color: palette.charcoal },
  cat: { ...typography.caption, color: palette.charcoalSoft, marginTop: 2 },
  nums: { alignItems: 'flex-end' },
  cost: { ...typography.bodySm, color: palette.oxblood, fontWeight: '600' },
  sub: { ...typography.caption, color: palette.charcoalSoft, marginTop: 2 },
  caliber: {
    ...typography.caption,
    color: palette.charcoalSoft,
    marginTop: spacing.md,
    lineHeight: 18,
  },
});
