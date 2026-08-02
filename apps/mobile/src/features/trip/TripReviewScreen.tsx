import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { hitTarget, palette, radius, spacing, typography } from '@/design-system';
import { listTripOutfits } from '@/core/trip/tripService';
import { listPackingItems, saveTemplate } from '@/core/trip/packingService';
import type { PackingItemView } from '@/core/trip/packView';
import type { TripOutfitDetail } from '@/core/db/dao';

export interface TripReviewScreenProps {
  tripId: string;
}

/**
 * 旅行复盘（TRP-06）：列出实际穿着（worn_status=completed/changed）与未穿（planned 仍未记录），
 * 「未穿」严格依据实际记录（不依据未勾选，任务卡验收锚点）。
 * 底部「保存为模板」：把当前清单 manual 项 + garment 项 label 存为 trip_template。
 * 五态覆盖：加载/空（无安排造型时提示）/失败/正常/恢复。
 */
export default function TripReviewScreen({ tripId }: TripReviewScreenProps) {
  const [outfits, setOutfits] = useState<TripOutfitDetail[]>([]);
  const [items, setItems] = useState<PackingItemView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [savedHint, setSavedHint] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([listTripOutfits(tripId), listPackingItems(tripId)])
      .then(([o, it]) => {
        setOutfits(o);
        setItems(it);
        setError(null);
      })
      .catch(() => setError('复盘加载失败，请重试'))
      .finally(() => setLoading(false));
  }, [tripId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // 实际穿着 = worn_status 非 planned（completed 或 changed）
  const worn = outfits.filter((o) => o.tripOutfit.wornStatus !== 'planned');
  // 未穿 = worn_status 仍为 planned（任务卡：依据实际记录，不依据未勾选）
  const unworn = outfits.filter((o) => o.tripOutfit.wornStatus === 'planned');

  // 模板候选：所有 manual 项 + 所有 garment 项 label（去重）
  const templateCandidates = (() => {
    const seen = new Set<string>();
    const out: { kind: 'garment' | 'manual'; label: string; garmentId?: string | null }[] = [];
    for (const it of items) {
      const key = `${it.kind}:${it.label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ kind: it.kind, label: it.label, garmentId: it.garmentId });
    }
    return out;
  })();

  const onSaveTemplate = async () => {
    const name = templateName.trim();
    if (!name) {
      setError('请填写模板名称');
      return;
    }
    setSavingTemplate(true);
    try {
      await saveTemplate({
        name,
        sourceTripId: tripId,
        items: templateCandidates.map((c) => ({ kind: c.kind, label: c.label, garmentId: c.garmentId ?? null })),
      });
      setSavedHint(`已保存模板「${name}」，共 ${templateCandidates.length} 项`);
      setTemplateName('');
      setError(null);
    } catch {
      setError('模板保存失败，请重试');
    } finally {
      setSavingTemplate(false);
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>旅行复盘</Text>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {savedHint ? <Text style={styles.successText}>{savedHint}</Text> : null}
      {loading ? <Text style={styles.muted}>加载中…</Text> : null}

      {!loading && outfits.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>尚无安排</Text>
          <Text style={styles.muted}>先去旅行总览安排每日造型并记录实际穿着，再来这里复盘。</Text>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>实际穿着 · {worn.length}</Text>
      {worn.length === 0 && !loading ? <Text style={styles.muted}>还没有记录任何已穿造型</Text> : null}
      {worn.map((o) => (
        <View key={o.tripOutfit.id} style={styles.card}>
          <Text style={styles.cardTitle}>
            {o.tripOutfit.date} · {o.tripOutfit.timeLabel}
          </Text>
          <Text style={styles.cardMeta}>
            {o.tripOutfit.wornStatus === 'completed' ? '按计划穿' : '有变化'}
            {o.tripOutfit.wornChangeNote ? ` · ${o.tripOutfit.wornChangeNote}` : ''}
          </Text>
        </View>
      ))}

      <Text style={styles.sectionTitle}>未穿（仍为计划） · {unworn.length}</Text>
      <Text style={styles.hint}>「未穿」依据实际记录（worn_status=planned），不依据打包清单未勾选。</Text>
      {unworn.length === 0 && !loading ? <Text style={styles.muted}>全部安排都已记录</Text> : null}
      {unworn.map((o) => (
        <View key={o.tripOutfit.id} style={[styles.card, styles.unwornCard]}>
          <Text style={styles.cardTitle}>
            {o.tripOutfit.date} · {o.tripOutfit.timeLabel}
          </Text>
          <Text style={styles.cardMeta}>未记录实际穿着</Text>
        </View>
      ))}

      <Text style={styles.sectionTitle}>保存为模板</Text>
      <Text style={styles.hint}>
        把当前清单（{templateCandidates.length} 项）保存为可复用模板，下次新建旅行时可作为预填。
      </Text>
      <View style={styles.tmplRow}>
        <TextInput
          value={templateName}
          onChangeText={setTemplateName}
          placeholder="如：3 天出差基础包"
          placeholderTextColor={palette.charcoalSoft}
          style={styles.tmplInput}
          accessibilityLabel="模板名称"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="保存模板"
          disabled={savingTemplate || templateCandidates.length === 0}
          onPress={() => void onSaveTemplate()}
          style={[styles.tmplBtn, (savingTemplate || templateCandidates.length === 0) && styles.tmplBtnDisabled]}
        >
          <Text style={styles.tmplBtnLabel}>{savingTemplate ? '保存中…' : '保存'}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.paperWhite },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { ...typography.title, color: palette.charcoal },
  muted: { ...typography.bodySm, color: palette.charcoalSoft },
  errorText: { ...typography.bodySm, color: palette.danger, marginTop: spacing.sm },
  successText: { ...typography.bodySm, color: palette.success, marginTop: spacing.sm },
  emptyBox: { marginTop: spacing.xl, alignItems: 'center', paddingHorizontal: spacing.lg },
  emptyTitle: { ...typography.headline, color: palette.charcoal, marginBottom: spacing.xs },
  sectionTitle: { ...typography.headline, color: palette.charcoal, marginTop: spacing.lg, marginBottom: spacing.xxs },
  hint: { ...typography.caption, color: palette.charcoalSoft, marginBottom: spacing.xs },
  card: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: palette.sandSoft,
    marginTop: spacing.xs,
  },
  unwornCard: { backgroundColor: palette.paperWhite, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.hairline },
  cardTitle: { ...typography.body, color: palette.charcoal },
  cardMeta: { ...typography.bodySm, color: palette.charcoalSoft, marginTop: 2 },
  tmplRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', marginTop: spacing.xs },
  tmplInput: {
    flex: 1,
    ...typography.body,
    color: palette.charcoal,
    backgroundColor: palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    minHeight: hitTarget.preferred,
  },
  tmplBtn: {
    minHeight: hitTarget.preferred,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: palette.oxblood,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tmplBtnDisabled: { opacity: 0.6 },
  tmplBtnLabel: { ...typography.bodySm, color: palette.white },
});
