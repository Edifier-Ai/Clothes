import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { hitTarget, palette, radius, spacing, typography } from '@/design-system';
import { originalUri } from '@/core/files/uri';
import { listActiveGarmentsWithThumbs } from '@/core/garments/service';
import type { PackingItemView } from '@/core/trip/packView';
import { packingSummary } from '@/core/trip/packView';
import {
  addManualItem,
  listPackingItems,
  regeneratePacking,
  removeManualItem,
  toggleCheck,
} from '@/core/trip/packingService';

export interface PackingListScreenProps {
  tripId: string;
}

/**
 * 打包清单（TRP-05）：去重 garment 项 + 手工项；勾选/取消勾选（幂等），
 * 添加/删除手工项；缺失项（衣物被删/归档）显示标记但不静默消失；
 * 顶部「重新生成」按钮（regenerate 保留仍存在 garment 项勾选状态，不动 manual 项）。
 * 五态覆盖：加载/空（无安排造型时提示去 TRP-04）/失败/正常/恢复。
 */
export default function PackingListScreen({ tripId }: PackingListScreenProps) {
  const [items, setItems] = useState<PackingItemView[]>([]);
  const [thumbs, setThumbs] = useState<Map<string, string | null>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manualLabel, setManualLabel] = useState('');
  const [regenerating, setRegenerating] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([listPackingItems(tripId), listActiveGarmentsWithThumbs()])
      .then(([it, g]) => {
        setItems(it);
        setThumbs(new Map(g.map((row) => [row.garment.id, row.imageRelPath])));
        setError(null);
      })
      .catch(() => setError('清单加载失败，请重试'))
      .finally(() => setLoading(false));
  }, [tripId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const summary = packingSummary(items);

  const onRegenerate = async () => {
    setRegenerating(true);
    try {
      await regeneratePacking(tripId);
      await load();
    } catch {
      setError('重新生成失败，请重试');
    } finally {
      setRegenerating(false);
    }
  };

  const onToggle = async (item: PackingItemView) => {
    try {
      const updated = await toggleCheck(item.id, !item.checked);
      setItems((prev) => prev.map((x) => (x.id === item.id ? updated : x)));
    } catch {
      setError('勾选失败，请重试');
    }
  };

  const onAddManual = async () => {
    const label = manualLabel.trim();
    if (!label) return;
    try {
      await addManualItem({ tripId, label });
      setManualLabel('');
      await load();
    } catch {
      setError('添加失败，请重试');
    }
  };

  const onRemoveManual = async (item: PackingItemView) => {
    try {
      await removeManualItem(item.id);
      await load();
    } catch {
      setError('删除失败，请重试');
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <View style={styles.headCard}>
        <Text style={styles.headTitle}>打包清单</Text>
        <Text style={styles.headMeta}>
          共 {summary.total} 项 · 已勾选 {summary.checked} · 未勾选 {summary.unchecked}
          {summary.missingCount > 0 ? ` · 缺失 ${summary.missingCount}` : ''}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="根据已安排造型重新生成清单"
          disabled={regenerating}
          onPress={() => void onRegenerate()}
          style={[styles.regenBtn, regenerating && styles.regenBtnDisabled]}
        >
          <Text style={styles.regenBtnLabel}>{regenerating ? '生成中…' : '重新生成'}</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {loading && items.length === 0 ? <Text style={styles.muted}>加载中…</Text> : null}
      {!loading && items.length === 0 && !error ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>清单为空</Text>
          <Text style={styles.muted}>先去旅行总览安排每日造型，再来这里「重新生成」自动去重的打包清单。</Text>
        </View>
      ) : null}

      {items.map((item) => {
        const isGarment = item.kind === 'garment';
        const rel = isGarment ? thumbs.get(item.garmentId ?? '') ?? null : null;
        return (
          <View key={item.id} style={styles.row}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: item.checked }}
              accessibilityLabel={`${item.checked ? '取消勾选' : '勾选'} ${item.label}`}
              onPress={() => void onToggle(item)}
              style={[styles.checkbox, item.checked && styles.checkboxChecked]}
            >
              {item.checked ? <Text style={styles.checkboxMark}>✓</Text> : null}
            </Pressable>
            {isGarment ? (
              rel ? (
                <Image source={{ uri: originalUri(rel) }} style={styles.thumb} contentFit="cover" />
              ) : (
                <View style={[styles.thumb, styles.thumbBlank]} />
              )
            ) : (
              <View style={[styles.thumb, styles.thumbManual]}>
                <Text style={styles.thumbManualMark}>·</Text>
              </View>
            )}
            <View style={styles.rowInfo}>
              <Text style={[styles.rowLabel, item.checked && styles.rowLabelChecked]} numberOfLines={1}>
                {item.label}
              </Text>
              {isGarment ? (
                <Text style={styles.rowMeta}>
                  {item.sourceCount > 0 ? `被 ${item.sourceCount} 套造型使用` : ''}
                  {item.missing ? ' · 衣物已删除/归档' : ''}
                </Text>
              ) : (
                <Text style={styles.rowMeta}>手工项</Text>
              )}
            </View>
            {!isGarment ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`删除手工项 ${item.label}`}
                onPress={() => void onRemoveManual(item)}
                style={styles.removeBtn}
              >
                <Text style={styles.dangerLabel}>✕</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}

      <Text style={styles.sectionTitle}>添加手工项</Text>
      <View style={styles.addRow}>
        <TextInput
          value={manualLabel}
          onChangeText={setManualLabel}
          placeholder="如：牙刷、充电器"
          placeholderTextColor={palette.charcoalSoft}
          style={styles.addInput}
          accessibilityLabel="手工项名称"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="添加手工项"
          onPress={() => void onAddManual()}
          style={styles.addBtn}
        >
          <Text style={styles.addBtnLabel}>添加</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.paperWhite },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },
  headCard: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: palette.sandSoft,
  },
  headTitle: { ...typography.title, color: palette.charcoal },
  headMeta: { ...typography.bodySm, color: palette.charcoalSoft, marginTop: spacing.xxs },
  regenBtn: {
    minHeight: hitTarget.preferred,
    marginTop: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: palette.oxblood,
    alignItems: 'center',
    justifyContent: 'center',
  },
  regenBtnDisabled: { opacity: 0.6 },
  regenBtnLabel: { ...typography.bodySm, color: palette.white },
  muted: { ...typography.bodySm, color: palette.charcoalSoft },
  errorText: { ...typography.bodySm, color: palette.danger, marginTop: spacing.sm },
  emptyBox: { marginTop: spacing.xl, alignItems: 'center', paddingHorizontal: spacing.lg },
  emptyTitle: { ...typography.headline, color: palette.charcoal, marginBottom: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: hitTarget.preferred,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.hairline,
  },
  checkbox: {
    width: hitTarget.min,
    height: hitTarget.min,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.charcoalSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: palette.oxblood, borderColor: palette.oxblood },
  checkboxMark: { ...typography.bodySm, color: palette.white },
  thumb: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: palette.sandSoft },
  thumbBlank: { borderWidth: StyleSheet.hairlineWidth, borderColor: palette.hairline },
  thumbManual: { alignItems: 'center', justifyContent: 'center' },
  thumbManualMark: { ...typography.title, color: palette.charcoalSoft },
  rowInfo: { flex: 1 },
  rowLabel: { ...typography.body, color: palette.charcoal },
  rowLabelChecked: { color: palette.charcoalSoft, textDecorationLine: 'line-through' },
  rowMeta: { ...typography.caption, color: palette.charcoalSoft, marginTop: 2 },
  removeBtn: { minWidth: hitTarget.min, minHeight: hitTarget.min, alignItems: 'center', justifyContent: 'center' },
  dangerLabel: { ...typography.bodySm, color: palette.danger },
  sectionTitle: { ...typography.headline, color: palette.charcoal, marginTop: spacing.lg, marginBottom: spacing.xs },
  addRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  addInput: {
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
  addBtn: {
    minHeight: hitTarget.preferred,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: palette.oxblood,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnLabel: { ...typography.bodySm, color: palette.white },
});
