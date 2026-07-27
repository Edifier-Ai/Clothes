import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { hitTarget, palette, radius, spacing, typography } from '@/design-system';
import { originalUri } from '@/core/files/uri';
import {
  assetExists,
  deleteGarment,
  editGarment,
  getGarmentDetail,
  type GarmentDetail,
  type GarmentForm,
} from '@/core/garments/service';
import type { CreateGarmentInput } from '@/core/db/dao';

const CATEGORIES: { value: CreateGarmentInput['category']; label: string }[] = [
  { value: 'top', label: '上装' },
  { value: 'bottom', label: '下装' },
  { value: 'dress', label: '连衣裙' },
  { value: 'shoes', label: '鞋' },
  { value: 'outerwear', label: '外套' },
  { value: 'accessory', label: '配饰' },
  { value: 'other', label: '其他' },
];

function detailToForm(d: GarmentDetail): GarmentForm {
  const tag = (k: string) => d.tags.find((t) => t.kind === k)?.value ?? '';
  return {
    name: d.garment.name,
    category: d.garment.category as GarmentForm['category'],
    color: tag('color'),
    season: tag('season'),
    occasion: tag('occasion'),
  };
}

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.value, c.label]),
);

/** 单品详情 / 编辑（CLS-03 / CLS-04）。原图缺失显示可修复状态，不删记录。 */
export default function GarmentDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [view, setView] = useState<{
    detail: GarmentDetail | null;
    exists: boolean;
    form: GarmentForm | null;
    editing: boolean;
  }>({ detail: null, exists: true, form: null, editing: false });
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      getGarmentDetail(id).then((d) => {
        if (!d) {
          setView({ detail: null, exists: true, form: null, editing: false });
          return;
        }
        setView({ detail: d, exists: true, form: detailToForm(d), editing: false });
        assetExists(d).then((ex) =>
          setView((v) => (v.detail === d ? { ...v, exists: ex } : v)),
        );
      });
    }, [id]),
  );

  if (!view.detail || !view.form) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>衣物不存在或已删除</Text>
      </View>
    );
  }

  const { detail, exists, form } = view;

  const save = async () => {
    if (!id) return;
    setBusy(true);
    editGarment(id, {
      name: form.name.trim() || '未命名衣物',
      category: form.category,
      tags: [
        ...(form.color ? [{ kind: 'color' as const, value: form.color, confidence: 1 }] : []),
        ...(form.season ? [{ kind: 'season' as const, value: form.season, confidence: 1 }] : []),
        ...(form.occasion ? [{ kind: 'occasion' as const, value: form.occasion, confidence: 1 }] : []),
      ],
    });
    const d = await getGarmentDetail(id);
    setBusy(false);
    if (d) setView({ detail: d, exists: true, form: detailToForm(d), editing: false });
  };

  const remove = async () => {
    if (!id) return;
    await deleteGarment(id);
    router.back();
  };

  return (
    <View style={styles.root}>
    <ScrollView contentContainerStyle={styles.container}>
      {exists ? (
        <Image source={{ uri: originalUri(detail.asset.originalRelPath) }} style={styles.hero} contentFit="contain" />
      ) : (
        <View style={[styles.hero, styles.heroMissing]}>
          <Text style={styles.muted}>原图缺失</Text>
          <Text style={styles.hint}>私有副本未找到，记录已保留，可重新导入修复。</Text>
        </View>
      )}

      {view.editing ? (
        <>
          <Text style={styles.label}>名称</Text>
          <TextInput
            value={form.name}
            onChangeText={(v) => setView((prev) => ({ ...prev, form: prev.form ? { ...prev.form, name: v } : prev.form }))}
            style={styles.input}
          />
          <Text style={styles.label}>类别</Text>
          <View style={styles.chipRow}>
            {CATEGORIES.map((c) => (
              <Pressable
                key={c.value}
                accessibilityRole="button"
                onPress={() => setView((prev) => ({ ...prev, form: prev.form ? { ...prev.form, category: c.value } : prev.form }))}
                style={[styles.chip, form.category === c.value && styles.chipActive]}
              >
                <Text style={[styles.chipText, form.category === c.value && styles.chipTextActive]}>
                  {c.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>颜色</Text>
          <TextInput value={form.color ?? ''} onChangeText={(v) => setView((prev) => ({ ...prev, form: prev.form ? { ...prev.form, color: v } : prev.form }))} style={styles.input} />
          <Text style={styles.label}>季节</Text>
          <TextInput value={form.season ?? ''} onChangeText={(v) => setView((prev) => ({ ...prev, form: prev.form ? { ...prev.form, season: v } : prev.form }))} style={styles.input} />
          <Text style={styles.label}>场景</Text>
          <TextInput value={form.occasion ?? ''} onChangeText={(v) => setView((prev) => ({ ...prev, form: prev.form ? { ...prev.form, occasion: v } : prev.form }))} style={styles.input} />
        </>
      ) : (
        <>
          <Text style={styles.name}>{detail.garment.name}</Text>
          <Text style={styles.meta}>
            {CATEGORY_LABEL[detail.garment.category] ?? detail.garment.category}
          </Text>
          {detail.tags.length > 0 ? (
            <View style={styles.chipRow}>
              {detail.tags.map((t) => (
                <View key={t.id} style={styles.tag}>
                  <Text style={styles.tagText}>{t.value}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </>
      )}
    </ScrollView>

    <View style={styles.footer}>
      <View style={styles.actions}>
        {view.editing ? (
          <>
            <Pressable accessibilityRole="button" onPress={() => setView((v) => ({ ...v, editing: false }))} style={styles.secondary}>
              <Text style={styles.secondaryLabel}>取消</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={save} disabled={busy} style={styles.primary}>
              {busy ? <ActivityIndicator color={palette.white} /> : <Text style={styles.primaryLabel}>保存</Text>}
            </Pressable>
          </>
        ) : (
          <>
            <Pressable accessibilityRole="button" onPress={() => setView((v) => ({ ...v, editing: true }))} style={styles.secondary}>
              <Text style={styles.secondaryLabel}>编辑</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={remove} style={styles.danger}>
              <Text style={styles.primaryLabel}>删除</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.paperWhite },
  container: { padding: spacing.lg, paddingBottom: spacing.md, backgroundColor: palette.paperWhite },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg, backgroundColor: palette.paperWhite, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.hairline },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: palette.paperWhite },
  hero: { width: '100%', height: 320, borderRadius: radius.lg, backgroundColor: palette.sandSoft },
  heroMissing: { justifyContent: 'center', alignItems: 'center' },
  muted: { ...typography.body, color: palette.charcoalSoft },
  hint: { ...typography.caption, color: palette.charcoalSoft, marginTop: spacing.xs, textAlign: 'center', paddingHorizontal: spacing.lg },
  name: { ...typography.headline, color: palette.charcoal, marginTop: spacing.md },
  meta: { ...typography.bodySm, color: palette.charcoalSoft, marginTop: spacing.xxs },
  label: { ...typography.bodySm, color: palette.charcoalSoft, marginTop: spacing.md, marginBottom: spacing.xxs },
  input: {
    ...typography.body,
    color: palette.charcoal,
    backgroundColor: palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    minHeight: hitTarget.min,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xxs },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    minHeight: hitTarget.min,
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: palette.oxblood, borderColor: palette.oxblood },
  chipText: { ...typography.bodySm, color: palette.charcoal },
  chipTextActive: { color: palette.white },
  tag: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs, borderRadius: radius.pill, backgroundColor: palette.sand },
  tagText: { ...typography.caption, color: palette.charcoal },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  primary: { flex: 1, minHeight: hitTarget.preferred, borderRadius: radius.md, backgroundColor: palette.oxblood, justifyContent: 'center', alignItems: 'center' },
  primaryLabel: { ...typography.body, color: palette.white },
  secondary: { flex: 1, minHeight: hitTarget.preferred, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.hairline, justifyContent: 'center', alignItems: 'center' },
  secondaryLabel: { ...typography.body, color: palette.charcoal },
  danger: { flex: 1, minHeight: hitTarget.preferred, borderRadius: radius.md, backgroundColor: palette.danger, justifyContent: 'center', alignItems: 'center' },
});
