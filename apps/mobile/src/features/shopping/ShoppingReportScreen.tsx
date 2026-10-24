import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { hitTarget, palette, spacing, typography } from '@/design-system';
import {
  shoppingService,
  type ShoppingCandidateReport,
  type ShoppingService,
} from './shoppingService';
import { InlineState, PrimaryButton, ShoppingShell } from './ShoppingShell';
import { clampAssumedWears, validateProductUrl } from './validation';
import { shoppingTextGold } from './colors';

const CATEGORY_LABEL: Record<string, string> = {
  top: '上装',
  bottom: '下装',
  dress: '连衣裙',
  shoes: '鞋',
  outerwear: '外套',
  accessory: '配饰',
  other: '其他',
};

const VERDICTS = [
  { value: 'similar_owned' as const, label: '已有相似款', hint: '现有衣橱已经覆盖这类需求' },
  { value: 'fills_gap' as const, label: '补足缺口', hint: '它能补上你确认存在的类别缺口' },
  { value: 'considering' as const, label: '仍需考虑', hint: '先保留证据，不急着做决定' },
];

function money(minor: number | null | undefined): string {
  if (minor == null || !Number.isFinite(minor)) return '—';
  return `¥${(minor / 100).toFixed(2)}`;
}

function safeHost(productUrl: string | null): string | null {
  if (!productUrl) return null;
  try {
    return new URL(productUrl).hostname;
  } catch {
    return null;
  }
}

export default function ShoppingReportScreen({
  candidateId,
  service = shoppingService,
}: {
  candidateId?: string;
  service?: ShoppingService;
}) {
  const params = useLocalSearchParams<{ id: string }>();
  const id = candidateId ?? params.id;
  const router = useRouter();
  const [report, setReport] = useState<ShoppingCandidateReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVerdict, setSelectedVerdict] = useState<ShoppingCandidateReport['candidate']['verdict']>('undecided');
  const [updating, setUpdating] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(() => {
    if (!id) {
      setError('缺少候选标识，无法读取兼容报告。');
      setLoading(false);
      return;
    }
    setLoading(true);
    service
      .getCandidateReport(id)
      .then((next) => {
        if (!next) throw new Error('not found');
        setReport(next);
        setSelectedVerdict(next.candidate.verdict);
        setError(null);
      })
      .catch(() => setError('兼容报告暂时无法读取。候选与衣橱都没有被改动。'))
      .finally(() => setLoading(false));
  }, [id, service]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const host = useMemo(() => safeHost(report?.candidate.productUrl ?? null), [report?.candidate.productUrl]);

  const retryAnalysis = useCallback(async () => {
    if (!id || updating) return;
    setUpdating(true);
    setError(null);
    try {
      const next = await service.retryAnalysis(id);
      setReport(next);
      setSelectedVerdict(next.candidate.verdict);
    } catch {
      setError('恢复分析仍未完成。候选已保存在本机，可以稍后重试。');
    } finally {
      setUpdating(false);
    }
  }, [id, service, updating]);

  const openProductLink = useCallback(async () => {
    const checked = validateProductUrl(report?.candidate.productUrl ?? '');
    if (!checked.ok || !checked.value) {
      setError('商品链接未通过安全校验，已阻止打开。');
      return;
    }
    setError(null);
    try {
      await Linking.openURL(checked.value);
    } catch {
      setError('系统无法打开这个商品链接，请稍后重试。');
    }
  }, [report?.candidate.productUrl]);

  const changeWears = useCallback(async (delta: number) => {
    if (!report || !id || updating) return;
    const assumedWears = clampAssumedWears(report.candidate.assumedWears + delta);
    if (assumedWears === report.candidate.assumedWears) return;
    setUpdating(true);
    setError(null);
    try {
      setReport(await service.updateCandidate(id, { assumedWears }));
      setSaved(false);
    } catch {
      setError('预计穿着次数没有保存，当前报告保持原值。');
    } finally {
      setUpdating(false);
    }
  }, [id, report, service, updating]);

  const saveVerdict = useCallback(async () => {
    if (!report || !id || selectedVerdict === 'undecided') {
      setError('请选择“已有相似款”“补足缺口”或“仍需考虑”之一。');
      return;
    }
    setUpdating(true);
    setError(null);
    try {
      setReport(await service.updateCandidate(id, { verdict: selectedVerdict }));
      setSaved(true);
    } catch {
      setError('判断尚未保存，请重试。候选与衣橱没有被改动。');
    } finally {
      setUpdating(false);
    }
  }, [id, report, selectedVerdict, service]);

  const remove = useCallback(async () => {
    if (!id || updating) return;
    setUpdating(true);
    setError(null);
    try {
      await service.deleteCandidate(id);
      router.replace('/shopping');
    } catch {
      setError('候选删除失败；它仍完整保留，可以稍后重试。');
      setConfirmDelete(false);
    } finally {
      setUpdating(false);
    }
  }, [id, router, service, updating]);

  return (
    <ShoppingShell
      step="03"
      title="它能和衣橱怎么搭"
      subtitle="组合只使用真实可穿衣物；排序不受你的购买倾向影响。"
      footer={
        report ? (
          <PrimaryButton label={updating ? '保存中…' : '保存候选判断'} disabled={updating} onPress={saveVerdict} />
        ) : undefined
      }
    >
      {loading && !report ? (
        <View accessibilityLabel="正在加载兼容报告" style={styles.loading}>
          <ActivityIndicator color={palette.charcoal} />
          <Text style={styles.muted}>正在组合真实衣橱单品…</Text>
        </View>
      ) : null}

      {error ? <InlineState danger title="操作未完成" description={error} actionLabel={!report ? '重试' : undefined} onAction={!report ? load : undefined} /> : null}

      {report ? (
        <>
          <View style={styles.candidateHeading}>
            <View style={styles.candidateText}>
              <Text style={styles.overline}>购买兼容报告</Text>
              <Text style={styles.candidateName}>{report.candidate.name}</Text>
              <Text style={styles.candidateMeta}>
                {CATEGORY_LABEL[report.candidate.category] ?? report.candidate.category}
                {host ? ` · ${host}` : ''}
              </Text>
            </View>
            {report.candidate.imageRelPath ? (
              <Image
                source={{ uri: service.shoppingImageUri(report.candidate.imageRelPath) }}
                style={styles.candidateImage}
                contentFit="contain"
              />
            ) : null}
          </View>

          <View style={styles.reportActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="返回候选列表"
              onPress={() => router.push('/shopping')}
              style={styles.reportAction}
            >
              <Text style={styles.reportActionText}>返回候选列表</Text>
            </Pressable>
            {report.candidate.productUrl ? (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel="在系统中打开商品链接"
                onPress={openProductLink}
                style={styles.reportAction}
              >
                <Text style={styles.reportActionText}>打开商品链接</Text>
              </Pressable>
            ) : null}
          </View>

          {report.candidate.analysisState === 'pending' ? (
            <InlineState
              title="组合分析尚未完成"
              description="当前的 0 套不是最终结论。候选已经保存，可以继续恢复本地分析。"
              actionLabel={updating ? '正在恢复…' : '恢复分析'}
              onAction={retryAnalysis}
            />
          ) : (
            <>
              <View style={styles.countBlock}>
                <Text style={styles.count}>{report.compatibleLookCount}</Text>
                <View style={styles.countText}>
                  <Text style={styles.countTitle}>套合法组合</Text>
                  <Text style={styles.muted}>下面最多展示前三套，全部来自当前衣橱硬约束。</Text>
                </View>
              </View>

              {report.looks.length === 0 ? (
                <InlineState
                  title="还没有完整组合"
                  description="这说明当前衣橱缺少合法槽位证据，不等于商品值得买。可以先补录衣物或标记“仍需考虑”。"
                />
              ) : (
                <View style={styles.lookList}>
                  {report.looks.slice(0, 3).map((look, index) => (
                    <View key={look.id} style={styles.lookCard}>
                      <View style={styles.lookHeader}>
                        <Text style={styles.lookIndex}>{String(index + 1).padStart(2, '0')}</Text>
                        <View style={styles.lookHeaderText}>
                          <Text style={styles.lookTitle}>真实衣橱组合</Text>
                          <Text style={styles.lookCandidate}>候选填入：{CATEGORY_LABEL[look.candidateSlot] ?? look.candidateSlot}</Text>
                        </View>
                      </View>
                      <View style={styles.garmentRow}>
                        {look.items.map((item) => (
                          <Pressable
                            key={item.garmentId}
                            accessibilityRole="button"
                            accessibilityLabel={`打开衣物 ${item.name}`}
                            onPress={() => router.push(`/garment/${item.garmentId}`)}
                            style={styles.garment}
                          >
                            {item.imageRelPath ? (
                              <Image
                                source={{ uri: service.shoppingImageUri(item.imageRelPath) }}
                                style={styles.garmentImage}
                                contentFit="contain"
                              />
                            ) : (
                              <View style={[styles.garmentImage, styles.garmentEmpty]}>
                                <Text style={styles.garmentEmptyText}>暂无图片</Text>
                              </View>
                            )}
                            <Text style={styles.garmentName}>{item.name}</Text>
                            <Text style={styles.garmentCategory}>{CATEGORY_LABEL[item.category] ?? item.category}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  ))}
                </View>
              )}

              <View style={styles.gapSection}>
                <Text style={styles.sectionTitle}>衣橱缺口</Text>
                <Text style={styles.muted}>
                  {report.compatibleLookCount > 0
                    ? '本次候选能进入至少一套完整合法组合，未发现阻断这些组合的必需槽位缺口。此结论只针对本次候选。'
                    : '当前还缺少完整合法槽位组合；证据不足，不能据此判断候选补足了缺口。'}
                </Text>
              </View>
            </>
          )}

          <View style={styles.costSection}>
            <Text style={styles.sectionTitle}>预计成本 / 次</Text>
            {report.costPerWear ? (
              <>
                <Text style={styles.cost}>{money(report.costPerWear.estimatedMinor)} / 次</Text>
                <Text style={styles.assumption}>
                  按预计穿 {report.costPerWear.assumedWears} 次的假设，由 {money(report.costPerWear.priceMinor)} ÷ {report.costPerWear.assumedWears} 计算。
                </Text>
                <View style={styles.stepper}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="预计穿着次数减少 5 次"
                    disabled={updating}
                    onPress={() => changeWears(-5)}
                    style={styles.stepButton}
                  >
                    <Text style={styles.stepLabel}>减少 5</Text>
                  </Pressable>
                  <Text accessibilityLabel={`预计穿 ${report.candidate.assumedWears} 次`} style={styles.wearsValue}>
                    {report.candidate.assumedWears} 次
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="预计穿着次数增加 5 次"
                    disabled={updating}
                    onPress={() => changeWears(5)}
                    style={styles.stepButton}
                  >
                    <Text style={styles.stepLabel}>增加 5</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <Text style={styles.muted}>未填写价格，无法估算。你仍可依据相似款与组合证据保存判断。</Text>
            )}
          </View>

          <View style={styles.verdictSection}>
            <Text style={styles.sectionTitle}>你的判断</Text>
            <Text style={styles.muted}>三种状态都不会改变推荐排序，也不会触发购买。</Text>
            {VERDICTS.map((item) => {
              const selected = selectedVerdict === item.value;
              return (
                <Pressable
                  key={item.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={item.label}
                  onPress={() => {
                    setSelectedVerdict(item.value);
                    setSaved(false);
                  }}
                  style={[styles.verdict, selected && styles.verdictSelected]}
                >
                  <View style={[styles.radio, selected && styles.radioSelected]} />
                  <View style={styles.verdictText}>
                    <Text style={[styles.verdictLabel, selected && styles.verdictLabelSelected]}>{item.label}</Text>
                    <Text style={[styles.verdictHint, selected && styles.verdictHintSelected]}>{item.hint}</Text>
                  </View>
                </Pressable>
              );
            })}
            {saved ? <Text style={styles.saved}>已保存。你的衣橱、造型和推荐排序均未被修改。</Text> : null}
          </View>

          <View style={styles.deleteSection}>
            {!confirmDelete ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="删除候选"
                onPress={() => setConfirmDelete(true)}
                style={styles.deleteLink}
              >
                <Text style={styles.deleteLinkText}>删除这条候选</Text>
              </Pressable>
            ) : (
              <InlineDeleteConfirmation busy={updating} onCancel={() => setConfirmDelete(false)} onConfirm={remove} />
            )}
          </View>
        </>
      ) : null}
    </ShoppingShell>
  );
}

function InlineDeleteConfirmation({
  busy,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <View style={styles.confirmBox}>
      <Text style={styles.confirmTitle}>只删除购物候选？</Text>
      <Text style={styles.confirmText}>这只会删除这条购物候选，不会删除任何衣橱衣物、衣物照片或已有造型。</Text>
      <View style={styles.confirmActions}>
        <Pressable accessibilityRole="button" accessibilityLabel="取消删除" disabled={busy} onPress={onCancel} style={styles.cancelButton}>
          <Text style={styles.cancelLabel}>取消</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="确认只删除候选" disabled={busy} onPress={onConfirm} style={styles.confirmButton}>
          <Text style={styles.confirmLabel}>{busy ? '删除中…' : '确认只删除候选'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  muted: { ...typography.bodySm, color: palette.charcoalSoft },
  candidateHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.hairline,
  },
  candidateText: { flex: 1, paddingRight: spacing.md },
  overline: { ...typography.caption, color: shoppingTextGold, letterSpacing: 1 },
  candidateName: { ...typography.title, color: palette.charcoal, marginTop: spacing.xxs },
  candidateMeta: { ...typography.bodySm, color: palette.charcoalSoft, marginTop: spacing.xs },
  candidateImage: { width: 96, height: 112, backgroundColor: palette.sandSoft },
  countBlock: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.lg },
  reportActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginVertical: spacing.md },
  reportAction: {
    minHeight: hitTarget.preferred,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
  },
  reportActionText: { ...typography.bodySm, color: palette.charcoal, textDecorationLine: 'underline' },
  count: { ...typography.display, color: shoppingTextGold, fontSize: 60, lineHeight: 66, marginRight: spacing.md },
  countText: { flex: 1 },
  countTitle: { ...typography.headline, color: palette.charcoal, marginBottom: spacing.xxs },
  lookList: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.hairline },
  lookCard: { paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.hairline },
  lookHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.sm },
  lookIndex: { ...typography.title, color: shoppingTextGold, width: 40 },
  lookHeaderText: { flex: 1 },
  lookTitle: { ...typography.headline, color: palette.charcoal },
  lookCandidate: { ...typography.caption, color: palette.charcoalSoft, marginTop: 2 },
  garmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, paddingLeft: 40 },
  garment: { width: '30%', minWidth: 78, minHeight: 152 },
  garmentImage: { width: '100%', aspectRatio: 0.78, backgroundColor: palette.sandSoft },
  garmentEmpty: { alignItems: 'center', justifyContent: 'center' },
  garmentEmptyText: { ...typography.caption, color: palette.charcoalSoft, textAlign: 'center' },
  garmentName: { ...typography.bodySm, color: palette.charcoal, marginTop: spacing.xs },
  garmentCategory: { ...typography.caption, color: palette.charcoalSoft },
  gapSection: { marginTop: spacing.xl, paddingTop: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.hairline },
  costSection: { marginTop: spacing.xl, paddingTop: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.hairline },
  sectionTitle: { ...typography.headline, color: palette.charcoal, marginBottom: spacing.xs },
  cost: { ...typography.display, color: shoppingTextGold, fontSize: 42, lineHeight: 50 },
  assumption: { ...typography.bodySm, color: palette.charcoalSoft, marginTop: spacing.xs },
  stepper: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md },
  stepButton: {
    minWidth: 72,
    minHeight: hitTarget.preferred,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: { ...typography.body, color: palette.charcoal },
  wearsValue: { ...typography.headline, color: palette.charcoal, flex: 1, textAlign: 'center' },
  verdictSection: { marginTop: spacing.xl },
  verdict: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
  },
  verdictSelected: { backgroundColor: palette.oxblood, borderColor: palette.oxblood },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: palette.charcoalSoft, marginRight: spacing.sm },
  radioSelected: { borderWidth: 5, borderColor: palette.white },
  verdictText: { flex: 1, paddingVertical: spacing.xs },
  verdictLabel: { ...typography.body, color: palette.charcoal },
  verdictLabelSelected: { color: palette.white },
  verdictHint: { ...typography.caption, color: palette.charcoalSoft, marginTop: 2 },
  verdictHintSelected: { color: palette.sandSoft },
  saved: { ...typography.bodySm, color: palette.success, marginTop: spacing.sm },
  deleteSection: { marginTop: spacing.xl },
  deleteLink: { minHeight: hitTarget.preferred, alignSelf: 'flex-start', justifyContent: 'center' },
  deleteLinkText: { ...typography.bodySm, color: palette.danger, textDecorationLine: 'underline' },
  confirmBox: { borderLeftWidth: 2, borderLeftColor: palette.danger, backgroundColor: palette.sandSoft, padding: spacing.md },
  confirmTitle: { ...typography.headline, color: palette.danger },
  confirmText: { ...typography.bodySm, color: palette.charcoalSoft, marginTop: spacing.xs },
  confirmActions: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md },
  cancelButton: {
    flex: 1,
    minHeight: hitTarget.preferred,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelLabel: { ...typography.bodySm, color: palette.charcoal },
  confirmButton: { flex: 1.5, minHeight: hitTarget.preferred, backgroundColor: palette.danger, alignItems: 'center', justifyContent: 'center' },
  confirmLabel: { ...typography.bodySm, color: palette.white },
});
