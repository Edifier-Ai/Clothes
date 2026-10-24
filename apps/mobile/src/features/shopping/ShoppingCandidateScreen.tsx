import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { GarmentCategory } from '@/core/db/schema';
import { hitTarget, palette, spacing, typography } from '@/design-system';
import {
  shoppingService,
  type ShoppingCandidateSummary,
  type ShoppingService,
} from './shoppingService';
import { PrimaryButton, ShoppingShell, InlineState } from './ShoppingShell';
import { clampAssumedWears, parsePriceMinor, validateProductUrl } from './validation';
import { shoppingTextGold } from './colors';

const CATEGORIES: { value: GarmentCategory; label: string }[] = [
  { value: 'top', label: '上装' },
  { value: 'bottom', label: '下装' },
  { value: 'dress', label: '连衣裙' },
  { value: 'shoes', label: '鞋' },
  { value: 'outerwear', label: '外套' },
  { value: 'accessory', label: '配饰' },
  { value: 'other', label: '其他' },
];

const ANALYSIS_LABEL: Record<string, string> = {
  pending: '等待分析',
  ready: '已有衣橱证据',
  insufficient_evidence: '证据不足',
  failed: '可重试',
};

export default function ShoppingCandidateScreen({
  service = shoppingService,
}: {
  service?: ShoppingService;
}) {
  const router = useRouter();
  const [asset, setAsset] = useState<{ uri: string; mimeType: string | null } | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<GarmentCategory>('top');
  const [priceText, setPriceText] = useState('');
  const [productUrl, setProductUrl] = useState('');
  const [wearsText, setWearsText] = useState('30');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<ShoppingCandidateSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(false);

  const loadSaved = useCallback(() => {
    setListLoading(true);
    service
      .listCandidates()
      .then((items) => {
        setSaved(items);
        setListError(false);
      })
      .catch(() => setListError(true))
      .finally(() => setListLoading(false));
  }, [service]);

  useFocusEffect(
    useCallback(() => {
      loadSaved();
    }, [loadSaved]),
  );

  const pickImage = useCallback(async () => {
    setError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        quality: 0.9,
      });
      if (result.canceled || !result.assets[0]) return;
      const picked = result.assets[0];
      setAsset({ uri: picked.uri, mimeType: picked.mimeType ?? null });
    } catch {
      setError('无法读取这张图片。可以重试，或不添加图片只填商品信息。');
    }
  }, []);

  const submit = useCallback(async () => {
    setError(null);
    if (!name.trim()) {
      setError('请先填写候选名称，之后才能在列表中认出它。');
      return;
    }
    const priceMinor = parsePriceMinor(priceText);
    if (priceMinor === 'invalid') {
      setError('价格应为大于 0 的数字，最多保留两位小数；也可以留空。');
      return;
    }
    const url = validateProductUrl(productUrl);
    if (!url.ok) {
      setError(url.message);
      return;
    }
    const assumedWears = clampAssumedWears(Number(wearsText));
    setBusy(true);
    try {
      const report = await service.createCandidate({
        sourceUri: asset?.uri ?? null,
        mimeType: asset?.mimeType ?? null,
        name: name.trim(),
        category,
        priceMinor,
        currency: priceMinor == null ? null : 'CNY',
        productUrl: url.value,
        assumedWears,
      });
      router.push(`/shopping/${report.candidate.id}/similar`);
    } catch {
      setError('候选保存或分析失败。已填写内容仍在，可以直接重试。');
    } finally {
      setBusy(false);
    }
  }, [asset, category, name, priceText, productUrl, router, service, wearsText]);

  return (
    <ShoppingShell
      step="01"
      title="先把冲动变成证据"
      subtitle="只比较你的本地衣橱，不抓取商品数据，也不会替你下单。"
      footer={<PrimaryButton label={busy ? '正在检查…' : '检查衣橱证据'} disabled={busy} onPress={submit} />}
    >
      <Text style={styles.sectionNumber}>01</Text>
      <Text style={styles.sectionTitle}>添加购物候选</Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={asset ? '更换商品图片' : '从相册选择商品图片'}
        onPress={pickImage}
        style={styles.photoPicker}
      >
        {asset ? (
          <Image source={{ uri: asset.uri }} style={styles.photo} contentFit="contain" />
        ) : (
          <View style={styles.photoEmpty}>
            <Ionicons name="add-outline" size={36} color={palette.mutedGold} />
            <Text style={styles.photoTitle}>从相册添加商品图</Text>
            <Text style={styles.photoHint}>可跳过；无图时仍会保存信息，但不会猜测相似度</Text>
          </View>
        )}
      </Pressable>

      <Field label="名称" required value={name} onChangeText={setName} placeholder="例如：短款深蓝夹克" />

      <Text style={styles.label}>类别 · 必填</Text>
      <View style={styles.chips}>
        {CATEGORIES.map((item) => {
          const selected = category === item.value;
          return (
            <Pressable
              key={item.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`类别 ${item.label}`}
              onPress={() => setCategory(item.value)}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {category === 'accessory' || category === 'other' ? (
        <InlineState
          title="当前类别的组合证据有限"
          description="首版标准槽位暂不枚举配饰或其他类别的完整穿搭；仍可保存候选并查看严格同类的相似证据。"
        />
      ) : null}

      <Field
        label="价格（元）· 可选"
        value={priceText}
        onChangeText={setPriceText}
        placeholder="用于估算成本/次"
        inputMode="decimal"
      />
      <Field
        label="商品链接 · 可选"
        value={productUrl}
        onChangeText={setProductUrl}
        placeholder="仅接受 http / https"
        inputMode="url"
        autoCapitalize="none"
      />
      <Field
        label="预计会穿几次"
        value={wearsText}
        onChangeText={setWearsText}
        placeholder="30"
        inputMode="numeric"
      />
      <Text style={styles.assumption}>这只是你可修改的假设，不是购买收益预测。</Text>

      {error ? <InlineState danger title="还不能继续" description={error} /> : null}

      <View style={styles.savedHeader}>
        <Text style={styles.savedTitle}>已保存候选</Text>
        <Text style={styles.savedCount}>{saved.length}</Text>
      </View>
      {listLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={palette.charcoal} />
          <Text style={styles.muted}>正在读取本地候选…</Text>
        </View>
      ) : listError ? (
        <InlineState title="候选列表暂时不可用" description="新建表单未受影响。" actionLabel="重试读取" onAction={loadSaved} />
      ) : saved.length === 0 ? (
        <Text style={styles.muted}>还没有候选。保存后可随时回来继续比较。</Text>
      ) : (
        <View style={styles.savedList}>
          {saved.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`继续查看 ${item.name}`}
              onPress={() => router.push(`/shopping/${item.id}/similar`)}
              style={styles.savedRow}
            >
              <View style={styles.savedText}>
                <Text style={styles.savedName}>{item.name}</Text>
                <Text style={styles.savedMeta}>{ANALYSIS_LABEL[item.analysisState] ?? '已保存'}</Text>
              </View>
              <Ionicons name="arrow-forward-outline" size={20} color={palette.mutedGold} />
            </Pressable>
          ))}
        </View>
      )}
    </ShoppingShell>
  );
}

function Field({
  label,
  required = false,
  ...inputProps
}: {
  label: string;
  required?: boolean;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  inputMode?: 'decimal' | 'numeric' | 'url';
  autoCapitalize?: 'none';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}{required ? ' · 必填' : ''}</Text>
      <TextInput
        {...inputProps}
        accessibilityLabel={label}
        placeholderTextColor={palette.charcoalSoft}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sectionNumber: { ...typography.display, color: palette.mutedGold, fontSize: 44, lineHeight: 48 },
  sectionTitle: { ...typography.headline, color: palette.charcoal, marginBottom: spacing.md },
  photoPicker: {
    minHeight: 196,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    backgroundColor: palette.sandSoft,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  photo: { width: '100%', height: 232, backgroundColor: palette.sandSoft },
  photoEmpty: { minHeight: 196, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  photoTitle: { ...typography.body, color: palette.charcoal, marginTop: spacing.xs },
  photoHint: { ...typography.caption, color: palette.charcoalSoft, textAlign: 'center', marginTop: spacing.xxs },
  field: { marginTop: spacing.md },
  label: { ...typography.caption, color: palette.charcoalSoft, marginBottom: spacing.xs },
  input: {
    ...typography.body,
    minHeight: hitTarget.preferred,
    color: palette.charcoal,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.charcoalSoft,
    paddingHorizontal: 0,
    paddingVertical: spacing.xs,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.xs },
  chip: {
    minHeight: hitTarget.min,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
  },
  chipSelected: { backgroundColor: palette.oxblood, borderColor: palette.oxblood },
  chipText: { ...typography.bodySm, color: palette.charcoal },
  chipTextSelected: { color: palette.white },
  assumption: { ...typography.caption, color: palette.charcoalSoft, marginTop: spacing.xs, marginBottom: spacing.md },
  savedHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    paddingBottom: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.hairline,
  },
  savedTitle: { ...typography.headline, color: palette.charcoal },
  savedCount: { ...typography.title, color: shoppingTextGold },
  loadingRow: { minHeight: hitTarget.preferred, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  muted: { ...typography.bodySm, color: palette.charcoalSoft, paddingVertical: spacing.sm },
  savedList: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.hairline },
  savedRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.hairline,
  },
  savedText: { flex: 1, paddingRight: spacing.sm },
  savedName: { ...typography.body, color: palette.charcoal },
  savedMeta: { ...typography.caption, color: palette.charcoalSoft, marginTop: 2 },
});
