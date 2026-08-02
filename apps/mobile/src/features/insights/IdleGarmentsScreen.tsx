import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { hitTarget, palette, radius, spacing, typography } from '@/design-system';
import { getIdleReport, type IdleView } from '@/core/insights/insightsService';
import { originalUri } from '@/core/files/uri';
import { listGarmentThumbs } from '@/core/insights/insightsService';
import { TabShell } from '@/features/shell/TabShell';
import { CATEGORY_LABEL, formatIdleDays, IDLE_THRESHOLD_LABEL } from './insightsView';

/**
 * 久未穿（STA-02）：4 段（新录入未穿 / 30-60 / 60-90 / 90+），每段衣物缩略图 + 名称 +
 * 「N 天未穿」+ 主操作「为它搭一套」（跳转新建造型并预选该件）。
 */
export default function IdleGarmentsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<IdleView | null>(null);
  const [thumbs, setThumbs] = useState<Map<string, string | null>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([getIdleReport(Date.now()), listGarmentThumbs()])
      .then(([v, t]) => {
        setView(v);
        setThumbs(t);
        setError(null);
      })
      .catch(() => setError('久未穿加载失败，请重试'))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const renderGarment = (gid: string, days: string) => {
    const g = view?.garmentRows.get(gid);
    const rel = thumbs.get(gid) ?? null;
    return (
      <Pressable
        key={gid}
        accessibilityRole="button"
        accessibilityLabel={`为 ${g?.name ?? gid} 搭一套`}
        onPress={() => router.push({ pathname: '/look-from-garment', params: { garmentId: gid } })}
        style={styles.idleCard}
      >
        <View style={styles.idleRow}>
          {rel ? (
            <Image source={{ uri: originalUri(rel) }} style={styles.thumb} contentFit="contain" />
          ) : (
            <View style={[styles.thumb, styles.thumbBlank]} />
          )}
          <View style={styles.idleMeta}>
            <Text style={styles.idleName} numberOfLines={1}>{g?.name ?? gid}</Text>
            <Text style={styles.idleCat}>
              {CATEGORY_LABEL[g?.category ?? 'other'] ?? '其他'} · {days}
            </Text>
          </View>
          <Text style={styles.idleAction}>为它搭一套 →</Text>
        </View>
      </Pressable>
    );
  };

  const r = view?.report;
  const isEmpty = !r || (r.newUnworn.length + r.idle30.length + r.idle60.length + r.idle90.length === 0);

  return (
    <TabShell title="久未穿" subtitle="30 / 60 / 90 天分桶 + 新录入未穿">
      <ScrollView contentContainerStyle={styles.scroll}>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {loading && !view ? <Text style={styles.muted}>加载中…</Text> : null}
        {!loading && isEmpty && !error ? (
          <Text style={styles.muted}>还没有久未穿的衣物。继续记录穿着，这里会显示需要被盘活的单品。</Text>
        ) : null}

        {r && r.newUnworn.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>录入后未穿过 · {r.newUnworn.length}</Text>
            <Text style={styles.sectionHint}>这些衣物刚录入还没穿过，与长期未穿分开。</Text>
            {r.newUnworn.map((i) => renderGarment(i.garmentId, formatIdleDays(i)))}
          </View>
        ) : null}

        {r && r.idle30.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{IDLE_THRESHOLD_LABEL[30]} · {r.idle30.length}</Text>
            {r.idle30.map((i) => renderGarment(i.garmentId, formatIdleDays(i)))}
          </View>
        ) : null}

        {r && r.idle60.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{IDLE_THRESHOLD_LABEL[60]} · {r.idle60.length}</Text>
            {r.idle60.map((i) => renderGarment(i.garmentId, formatIdleDays(i)))}
          </View>
        ) : null}

        {r && r.idle90.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{IDLE_THRESHOLD_LABEL[90]} · {r.idle90.length}</Text>
            {r.idle90.map((i) => renderGarment(i.garmentId, formatIdleDays(i)))}
          </View>
        ) : null}

        {r ? (
          <Text style={styles.caliber}>
            口径：归档衣物不进久未穿（不在当前可穿库存），但其历史穿着仍计入总览。
            近 30 天穿过的不在这里。
          </Text>
        ) : null}
      </ScrollView>
    </TabShell>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  errorText: { ...typography.bodySm, color: palette.danger, marginTop: spacing.sm },
  muted: { ...typography.bodySm, color: palette.charcoalSoft, marginTop: spacing.sm },
  section: { marginTop: spacing.md },
  sectionTitle: { ...typography.headline, color: palette.charcoal, marginBottom: spacing.xxs },
  sectionHint: { ...typography.caption, color: palette.charcoalSoft, marginBottom: spacing.xs },
  idleCard: {
    minHeight: hitTarget.preferred,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: palette.sandSoft,
    marginTop: spacing.xs,
  },
  idleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  thumb: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: palette.white },
  thumbBlank: { borderWidth: StyleSheet.hairlineWidth, borderColor: palette.hairline },
  idleMeta: { flex: 1, minWidth: 0 },
  idleName: { ...typography.body, color: palette.charcoal },
  idleCat: { ...typography.caption, color: palette.charcoalSoft, marginTop: 2 },
  idleAction: { ...typography.caption, color: palette.oxblood },
  caliber: {
    ...typography.caption,
    color: palette.charcoalSoft,
    marginTop: spacing.md,
    lineHeight: 18,
  },
});
