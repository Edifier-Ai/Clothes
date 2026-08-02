import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { hitTarget, palette, radius, spacing, typography } from '@/design-system';
import type { LookDetail } from '@/core/db/dao';
import type { LookSlot } from '@/core/db/schema';
import { queryWardrobe } from '@/core/garments/service';
import { cloneLookById, createVariantLook, deleteLook, getLookDetail } from '@/core/looks/lookService';
import { rebuildCover } from './coverCompose';
import { GarmentPicker } from './GarmentPicker';
import { LookCover } from './LookCover';
import type { PickCandidate } from './pickFilter';
import { SLOT_LABEL } from './slotLayout';

const MODE_LABEL: Record<string, string> = { slots: '快速槽位', canvas: '自由画布' };

export interface LookDetailViewProps {
  lookId: string;
}

interface GarmentInfo {
  name: string;
  imageRelPath: string | null;
}

/**
 * 造型详情（LOK-05）与变体（LOK-06）：
 * 大图封面（缓存/实时合成）、单品清单（槽位/画布标识）、克隆、创建变体、软删；
 * 单品归档/缺图时显示占位与「去修复」。cover_rel_path 为空时后台重建封面。
 */
export function LookDetailView({ lookId }: LookDetailViewProps) {
  const router = useRouter();
  const [detail, setDetail] = useState<LookDetail | null | undefined>(undefined);
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [garments, setGarments] = useState<Map<string, GarmentInfo>>(new Map());
  const [candidates, setCandidates] = useState<PickCandidate[]>([]);
  const [variantTarget, setVariantTarget] = useState<string | null>(null); // garmentId
  const [variantOpen, setVariantOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await getLookDetail(lookId).catch(() => null);
    setDetail(d);
    if (d?.look.sourceLookId) {
      const src = await getLookDetail(d.look.sourceLookId).catch(() => null);
      setSourceName(src?.look.name ?? null);
    }
    const entries = await queryWardrobe({}, 'recentAdded').catch(() => []);
    const map = new Map<string, GarmentInfo>();
    const cands: PickCandidate[] = [];
    for (const e of entries) {
      const g = e.item.garment;
      map.set(g.id, { name: g.name, imageRelPath: e.imageRelPath });
      const tag = (k: string) => e.item.tags.find((t) => t.kind === k)?.value ?? null;
      cands.push({
        id: g.id,
        name: g.name,
        category: g.category as PickCandidate['category'],
        status: g.status as PickCandidate['status'],
        archivedAt: g.archivedAt,
        brand: tag('brand'),
        note: tag('note'),
        imageRelPath: e.previewRelPath,
        thumbnailRelPath: e.imageRelPath,
      });
    }
    setGarments(map);
    setCandidates(cands);
    // 缺缓存封面：后台从事实数据重建（失败不阻塞展示，LookCover 实时兜底）
    if (d && d.look.coverRelPath == null && d.items.length > 0) {
      rebuildCover(d.look.id).catch(() => undefined);
    }
  }, [lookId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const selectedIds = useMemo(
    () => new Set((detail?.items ?? []).map((it) => it.garmentId)),
    [detail],
  );

  if (detail === undefined) return <View style={styles.root} />;
  if (detail === null) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.muted}>造型不存在或已删除</Text>
      </View>
    );
  }

  const targetItem = variantTarget ? detail.items.find((it) => it.garmentId === variantTarget) : undefined;

  const doClone = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const clone = await cloneLookById(detail.look.id);
      router.replace(`/look/${clone.look.id}`);
    } catch {
      setError('克隆失败，请重试');
      setBusy(false);
    }
  };

  const doVariant = async (newGarmentId: string) => {
    if (!variantTarget || busy) return;
    setBusy(true);
    setError(null);
    try {
      const v = await createVariantLook(detail.look.id, { garmentId: variantTarget, newGarmentId });
      setVariantOpen(false);
      setVariantTarget(null);
      router.replace(`/look/${v.look.id}`);
    } catch {
      setError('创建变体失败，请重试');
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await deleteLook(detail.look.id);
      router.back();
    } catch {
      setError('删除失败，请重试');
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.container}>
        <LookCover lookId={detail.look.id} coverRelPath={detail.look.coverRelPath} width={330} height={330} />
        <Text style={styles.name}>{detail.look.name}</Text>
        <Text style={styles.meta}>
          {MODE_LABEL[detail.look.mode] ?? detail.look.mode} · {detail.items.length} 件
        </Text>
        {detail.look.sourceLookId ? (
          <Text style={styles.sourceLine}>基于 {sourceName ?? '原造型'}</Text>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>单品清单</Text>
          {detail.items.map((it) => {
            const info = garments.get(it.garmentId);
            const slotText = it.slot ? SLOT_LABEL[it.slot as LookSlot] : '画布';
            return (
              <View key={it.id} style={styles.itemRow}>
                <View style={styles.itemText}>
                  {info ? (
                    <Text style={styles.itemName} numberOfLines={1}>
                      {info.name}
                    </Text>
                  ) : (
                    <Text style={styles.itemMissing}>该单品不可用（已归档或图片缺失）</Text>
                  )}
                  <Text style={styles.itemSlot}>{slotText}</Text>
                </View>
                {info ? (
                  variantOpen ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setVariantTarget(it.garmentId)}
                      style={[styles.smallBtn, variantTarget === it.garmentId && styles.smallBtnActive]}
                    >
                      <Text style={[styles.smallBtnLabel, variantTarget === it.garmentId && styles.smallBtnLabelActive]}>
                        {variantTarget === it.garmentId ? '替换中…' : '替换这件'}
                      </Text>
                    </Pressable>
                  ) : null
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push(`/garment/${it.garmentId}`)}
                    style={styles.smallBtn}
                  >
                    <Text style={styles.smallBtnLabel}>去修复</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        {confirmDelete ? (
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={() => setConfirmDelete(false)} style={styles.secondary}>
              <Text style={styles.secondaryLabel}>取消</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={doDelete} disabled={busy} style={styles.danger}>
              <Text style={styles.primaryLabel}>确认删除</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={doClone} disabled={busy} style={styles.secondary}>
              <Text style={styles.secondaryLabel}>克隆</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setVariantOpen((o) => !o);
                setVariantTarget(null);
              }}
              disabled={busy}
              style={styles.secondary}
            >
              <Text style={styles.secondaryLabel}>{variantOpen ? '取消变体' : '创建变体'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setConfirmDelete(true)} disabled={busy} style={styles.danger}>
              <Text style={styles.primaryLabel}>删除</Text>
            </Pressable>
          </View>
        )}
      </View>

      {variantOpen && targetItem ? (
        <GarmentPicker
          candidates={candidates}
          slot={targetItem.slot as LookSlot | null}
          selectedIds={selectedIds}
          onPick={(c) => doVariant(c.id)}
          onClose={() => setVariantTarget(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.paperWhite },
  center: { justifyContent: 'center', alignItems: 'center' },
  container: { padding: spacing.lg, alignItems: 'center' },
  muted: { ...typography.body, color: palette.charcoalSoft },
  name: { ...typography.headline, color: palette.charcoal, marginTop: spacing.md, alignSelf: 'flex-start' },
  meta: { ...typography.bodySm, color: palette.charcoalSoft, marginTop: spacing.xxs, alignSelf: 'flex-start' },
  sourceLine: { ...typography.bodySm, color: palette.mutedGold, marginTop: spacing.xxs, alignSelf: 'flex-start' },
  card: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: palette.sandSoft,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    alignSelf: 'stretch',
  },
  cardTitle: { ...typography.bodySm, color: palette.charcoal, marginBottom: spacing.xs, fontWeight: '600' },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: hitTarget.min,
    gap: spacing.sm,
  },
  itemText: { flex: 1 },
  itemName: { ...typography.bodySm, color: palette.charcoal },
  itemMissing: { ...typography.bodySm, color: palette.danger },
  itemSlot: { ...typography.caption, color: palette.charcoalSoft },
  smallBtn: {
    minHeight: hitTarget.min,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
  },
  smallBtnActive: { backgroundColor: palette.oxblood, borderColor: palette.oxblood },
  smallBtnLabel: { ...typography.bodySm, color: palette.oxblood },
  smallBtnLabelActive: { color: palette.white },
  errorText: { ...typography.bodySm, color: palette.danger, marginTop: spacing.sm, alignSelf: 'flex-start' },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.hairline,
  },
  actions: { flexDirection: 'row', gap: spacing.sm },
  primaryLabel: { ...typography.body, color: palette.white },
  secondary: {
    flex: 1,
    minHeight: hitTarget.preferred,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryLabel: { ...typography.body, color: palette.charcoal },
  danger: {
    flex: 1,
    minHeight: hitTarget.preferred,
    borderRadius: radius.md,
    backgroundColor: palette.danger,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
