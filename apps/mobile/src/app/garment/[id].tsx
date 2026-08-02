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
  archiveGarmentById,
  assetExists,
  deleteGarment,
  editGarment,
  getGarmentDetail,
  getGarmentStatsById,
  getStatusHistory,
  setGarmentStatus,
  unarchiveGarmentById,
  type CareStatus,
  type GarmentDetail,
  type GarmentForm,
  type GarmentStats,
} from '@/core/garments/service';
import type { CreateGarmentInput } from '@/core/db/dao';
import type { GarmentStatusEventRow } from '@/core/db/schema';

const CATEGORIES: { value: CreateGarmentInput['category']; label: string }[] = [
  { value: 'top', label: '上装' },
  { value: 'bottom', label: '下装' },
  { value: 'dress', label: '连衣裙' },
  { value: 'shoes', label: '鞋' },
  { value: 'outerwear', label: '外套' },
  { value: 'accessory', label: '配饰' },
  { value: 'other', label: '其他' },
];

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.value, c.label]),
);

const STATUS_LABEL: Record<string, string> = {
  clean: '干净',
  laundry: '待洗',
  dryclean: '干洗',
  loaned: '借出',
  worn: '穿过',
  wishlist: '心愿单',
  archived: '已归档',
  restored: '恢复',
};

const CARE_STATUSES: CareStatus[] = ['clean', 'laundry', 'dryclean', 'loaned'];

/** 编辑态表单：GarmentForm + 价格/购买日（文本输入，保存时解析）。 */
interface EditForm extends GarmentForm {
  priceText: string;
  purchaseDate: string;
}

function detailToForm(d: GarmentDetail): EditForm {
  const tag = (k: string) => d.tags.find((t) => t.kind === k)?.value ?? '';
  return {
    name: d.garment.name,
    category: d.garment.category as GarmentForm['category'],
    color: tag('color'),
    season: tag('season'),
    occasion: tag('occasion'),
    brand: tag('brand'),
    note: tag('note'),
    priceText: d.garment.priceMinor != null ? (d.garment.priceMinor / 100).toString() : '',
    purchaseDate: d.garment.purchaseDate ?? '',
  };
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function fmtDateTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${fmtDate(ts)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 解析价格文本（元）→ 分；空/非法 → null（不保存价格）。 */
function parsePriceMinor(text: string): number | null {
  const v = Number.parseFloat(text.trim());
  if (!Number.isFinite(v) || v <= 0) return null;
  return Math.round(v * 100);
}

/** 单品详情 / 编辑（CLS-03/04/05/06/08）。原图缺失显示可修复状态，不删记录。 */
export default function GarmentDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [view, setView] = useState<{
    detail: GarmentDetail | null;
    exists: boolean;
    form: EditForm | null;
    editing: boolean;
  }>({ detail: null, exists: true, form: null, editing: false });
  const [stats, setStats] = useState<GarmentStats | null>(null);
  const [history, setHistory] = useState<GarmentStatusEventRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!id) return;
    const d = await getGarmentDetail(id);
    if (!d) {
      setView({ detail: null, exists: true, form: null, editing: false });
      return;
    }
    // 保留编辑态：统计/状态刷新不得把用户踢出表单或覆盖未保存输入
    setView((v) => ({
      detail: d,
      exists: true,
      form: v.editing && v.form ? v.form : detailToForm(d),
      editing: v.editing,
    }));
    assetExists(d).then((ex) => setView((v) => (v.detail === d ? { ...v, exists: ex } : v)));
    getGarmentStatsById(id).then(setStats);
    getStatusHistory(id).then(setHistory);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  if (!view.detail || !view.form) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>衣物不存在或已删除</Text>
      </View>
    );
  }

  const { detail, exists, form } = view;
  const archived = detail.garment.archivedAt != null;

  const save = async () => {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      const priceMinor = parsePriceMinor(form.priceText);
      const purchaseDate = /^\d{4}-\d{2}-\d{2}$/.test(form.purchaseDate.trim())
        ? form.purchaseDate.trim()
        : null;
      await editGarment(id, {
        name: form.name.trim() || '未命名衣物',
        category: form.category,
        priceMinor,
        currency: priceMinor != null ? 'CNY' : null,
        purchaseDate,
        tags: [
          ...(form.color ? [{ kind: 'color' as const, value: form.color, confidence: 1 }] : []),
          ...(form.season ? [{ kind: 'season' as const, value: form.season, confidence: 1 }] : []),
          ...(form.occasion ? [{ kind: 'occasion' as const, value: form.occasion, confidence: 1 }] : []),
          ...(form.brand ? [{ kind: 'brand' as const, value: form.brand, confidence: 1 }] : []),
          ...(form.note ? [{ kind: 'note' as const, value: form.note, confidence: 1 }] : []),
        ],
      });
      await reload();
      setView((v) => ({ ...v, editing: false }));
    } catch {
      setError('保存失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (to: CareStatus) => {
    if (!id || to === detail.garment.status) return;
    setError(null);
    try {
      await setGarmentStatus(id, to);
      await reload();
    } catch {
      setError('状态更新失败，请重试');
    }
  };

  const toggleArchive = async () => {
    if (!id) return;
    setError(null);
    try {
      if (archived) await unarchiveGarmentById(id);
      else await archiveGarmentById(id);
      await reload();
    } catch {
      setError(archived ? '恢复失败，请重试' : '归档失败，请重试');
    }
  };

  const remove = async () => {
    if (!id) return;
    await deleteGarment(id);
    router.back();
  };

  const setF = (patch: Partial<EditForm>) =>
    setView((prev) => ({ ...prev, form: prev.form ? { ...prev.form, ...patch } : prev.form }));

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
          <TextInput value={form.name} onChangeText={(v) => setF({ name: v })} style={styles.input} />
          <Text style={styles.label}>类别</Text>
          <View style={styles.chipRow}>
            {CATEGORIES.map((c) => (
              <Pressable
                key={c.value}
                accessibilityRole="button"
                onPress={() => setF({ category: c.value })}
                style={[styles.chip, form.category === c.value && styles.chipActive]}
              >
                <Text style={[styles.chipText, form.category === c.value && styles.chipTextActive]}>
                  {c.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>颜色</Text>
          <TextInput value={form.color ?? ''} onChangeText={(v) => setF({ color: v })} style={styles.input} />
          <Text style={styles.label}>季节</Text>
          <TextInput value={form.season ?? ''} onChangeText={(v) => setF({ season: v })} style={styles.input} />
          <Text style={styles.label}>场景</Text>
          <TextInput value={form.occasion ?? ''} onChangeText={(v) => setF({ occasion: v })} style={styles.input} />
          <Text style={styles.label}>品牌</Text>
          <TextInput value={form.brand ?? ''} onChangeText={(v) => setF({ brand: v })} style={styles.input} />
          <Text style={styles.label}>备注</Text>
          <TextInput value={form.note ?? ''} onChangeText={(v) => setF({ note: v })} style={styles.input} />
          <Text style={styles.label}>价格（元）</Text>
          <TextInput
            value={form.priceText}
            onChangeText={(v) => setF({ priceText: v })}
            style={styles.input}
            keyboardType="decimal-pad"
            placeholder="例如 199"
            placeholderTextColor={palette.charcoalSoft}
          />
          <Text style={styles.label}>购买日（YYYY-MM-DD）</Text>
          <TextInput
            value={form.purchaseDate}
            onChangeText={(v) => setF({ purchaseDate: v })}
            style={styles.input}
            placeholder="例如 2026-01-15"
            placeholderTextColor={palette.charcoalSoft}
          />
        </>
      ) : (
        <>
          <Text style={styles.name}>{detail.garment.name}</Text>
          <Text style={styles.meta}>
            {CATEGORY_LABEL[detail.garment.category] ?? detail.garment.category}
            {archived ? ' · 已归档' : ''}
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

          {/* CLS-03：真实统计 */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>穿着统计</Text>
            <Text style={styles.statLine}>
              穿过 {stats?.timesWorn ?? 0} 次
              {stats?.lastWornAt ? ` · 最近 ${fmtDate(stats.lastWornAt)}` : ' · 最近还未穿过'}
            </Text>
            <Text style={styles.statLine}>
              {stats?.costPerWearMinor != null
                ? `成本/次 ¥${(stats.costPerWearMinor / 100).toFixed(2)}（价格 ÷ 穿着次数）`
                : stats == null || (detail.garment.priceMinor ?? 0) <= 0
                  ? '成本/次：填写价格后展示（价格 ÷ 穿着次数）'
                  : '成本/次：穿过一次后展示（价格 ÷ 穿着次数）'}
            </Text>
            {detail.garment.purchaseDate ? (
              <Text style={styles.statLine}>购买于 {detail.garment.purchaseDate}</Text>
            ) : null}
            {stats && stats.outfits.length > 0 ? (
              <>
                <Text style={styles.cardSubtitle}>使用造型</Text>
                {stats.outfits.slice(0, 5).map((o) => (
                  <Text key={o.recommendationId} style={styles.statLine}>
                    {o.date} · {o.slots.map((s) => s.name).join(' + ')}
                  </Text>
                ))}
              </>
            ) : null}
          </View>

          {/* CLS-05：状态流转 */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              状态{archived ? '：已归档' : `：${STATUS_LABEL[detail.garment.status] ?? detail.garment.status}`}
            </Text>
            {archived ? (
              <Text style={styles.hint}>已归档的衣物不出现在衣橱和推荐中，历史完整保留。</Text>
            ) : (
              <View style={styles.chipRow}>
                {CARE_STATUSES.map((s) => (
                  <Pressable
                    key={s}
                    accessibilityRole="button"
                    onPress={() => changeStatus(s)}
                    style={[styles.chip, detail.garment.status === s && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, detail.garment.status === s && styles.chipTextActive]}>
                      {STATUS_LABEL[s]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
            <Pressable accessibilityRole="button" onPress={toggleArchive} style={styles.archiveBtn}>
              <Text style={styles.archiveBtnText}>{archived ? '恢复到衣橱' : '归档'}</Text>
            </Pressable>
          </View>

          {/* CLS-06：状态历史（含时间记录） */}
          {history.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>状态历史</Text>
              {[...history].reverse().slice(0, 10).map((e) => (
                <Text key={e.id} style={styles.statLine}>
                  {fmtDateTime(e.changedAt)} ·{' '}
                  {e.fromStatus ? `${STATUS_LABEL[e.fromStatus] ?? e.fromStatus} → ` : ''}
                  {STATUS_LABEL[e.toStatus] ?? e.toStatus}
                </Text>
              ))}
            </View>
          ) : null}
        </>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
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
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/cutout-editor', params: { id: id ?? '' } })}
              style={styles.secondary}
            >
              <Text style={styles.secondaryLabel}>修边</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={remove} style={styles.danger}>
              <Text style={styles.primaryLabel}>删除</Text>
            </Pressable>
          </>
        )}
      </View>
      {!view.editing && id ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/look-from-garment', params: { hero: id } })}
          style={[styles.secondary, styles.fullWidthBtn]}
        >
          <Text style={styles.secondaryLabel}>由此创建造型</Text>
        </Pressable>
      ) : null}
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
  hint: { ...typography.caption, color: palette.charcoalSoft, marginTop: spacing.xs },
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
  card: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: palette.sandSoft,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
  },
  cardTitle: { ...typography.bodySm, color: palette.charcoal, marginBottom: spacing.xs, fontWeight: '600' },
  cardSubtitle: { ...typography.caption, color: palette.charcoalSoft, marginTop: spacing.sm, marginBottom: spacing.xxs },
  statLine: { ...typography.bodySm, color: palette.charcoal, marginTop: spacing.xxs },
  archiveBtn: { marginTop: spacing.sm, minHeight: hitTarget.min, justifyContent: 'center' },
  archiveBtnText: { ...typography.bodySm, color: palette.oxblood },
  errorText: { ...typography.bodySm, color: palette.danger, marginTop: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  primary: { flex: 1, minHeight: hitTarget.preferred, borderRadius: radius.md, backgroundColor: palette.oxblood, justifyContent: 'center', alignItems: 'center' },
  primaryLabel: { ...typography.body, color: palette.white },
  secondary: { flex: 1, minHeight: hitTarget.preferred, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.hairline, justifyContent: 'center', alignItems: 'center' },
  secondaryLabel: { ...typography.body, color: palette.charcoal },
  danger: { flex: 1, minHeight: hitTarget.preferred, borderRadius: radius.md, backgroundColor: palette.danger, justifyContent: 'center', alignItems: 'center' },
  fullWidthBtn: { marginTop: spacing.sm },
});
