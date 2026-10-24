import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { palette, spacing, typography } from '@/design-system';
import {
  shoppingService,
  type ShoppingCandidateReport,
  type ShoppingService,
} from './shoppingService';
import { InlineState, PrimaryButton, ShoppingShell } from './ShoppingShell';
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

function percent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '无数据';
  const normalized = value <= 1 ? value * 100 : value;
  return `${Math.max(0, Math.min(100, Math.round(normalized)))}%`;
}

export default function ShoppingSimilarityScreen({
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

  const load = useCallback(() => {
    if (!id) {
      setError('缺少候选标识，无法读取本地报告。');
      setLoading(false);
      return;
    }
    setLoading(true);
    service
      .getCandidateReport(id)
      .then((next) => {
        if (!next) throw new Error('not found');
        setReport(next);
        setError(null);
      })
      .catch(() => setError('相似证据暂时无法读取。候选仍保存在本机。'))
      .finally(() => setLoading(false));
  }, [id, service]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const retry = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setReport(await service.retryAnalysis(id));
    } catch {
      setError('重新分析仍未完成。可保留候选，稍后再次重试。');
    } finally {
      setLoading(false);
    }
  }, [id, service]);

  const candidate = report?.candidate;
  const similarities = report?.similarities.slice(0, 3) ?? [];
  const analysisPending = candidate?.analysisState === 'pending';
  const analysisFailed = candidate?.analysisState === 'failed';
  const insufficient =
    candidate?.analysisState === 'insufficient_evidence' ||
    (!loading && report != null && !analysisPending && !analysisFailed && similarities.length === 0);

  return (
    <ShoppingShell
      step="02"
      title="衣橱里已经有什么"
      subtitle="类别是硬门槛；感知哈希、Lab 色彩与轮廓只在同类衣物中比较。"
      footer={
        report ? (
          <PrimaryButton label="查看可搭组合" onPress={() => router.push(`/shopping/${report.candidate.id}/report`)} />
        ) : undefined
      }
    >
      {loading && !report ? (
        <View accessibilityLabel="正在加载相似证据" style={styles.loading}>
          <ActivityIndicator color={palette.charcoal} />
          <Text style={styles.muted}>正在读取本地衣橱证据…</Text>
        </View>
      ) : null}

      {error ? <InlineState danger title="读取未完成" description={error} actionLabel="重试" onAction={load} /> : null}

      {candidate ? (
        <>
          <View style={styles.candidate}>
            {candidate.imageRelPath ? (
              <Image
                source={{ uri: service.shoppingImageUri(candidate.imageRelPath) }}
                style={styles.candidateImage}
                contentFit="contain"
              />
            ) : (
              <View style={[styles.candidateImage, styles.imageEmpty]}>
                <Text style={styles.imageEmptyText}>未添加商品图</Text>
              </View>
            )}
            <View style={styles.candidateText}>
              <Text style={styles.overline}>本次候选</Text>
              <Text style={styles.candidateName}>{candidate.name}</Text>
              <Text style={styles.candidateMeta}>{CATEGORY_LABEL[candidate.category] ?? candidate.category}</Text>
            </View>
          </View>

          <View style={styles.summaryLine}>
            <Text style={styles.summaryNumber}>{similarities.length}</Text>
            <View style={styles.summaryText}>
              <Text style={styles.summaryTitle}>件同类衣物进入比较</Text>
              <Text style={styles.muted}>最多展示稳定排序的前三件；跨类别同色不会混入。</Text>
            </View>
          </View>

          {analysisPending ? (
            <InlineState
              title="正在分析"
              description="候选已经保存在本机。图片特征完成后会按稳定规则显示结果。"
              actionLabel={loading ? '正在恢复…' : '继续分析'}
              onAction={retry}
            />
          ) : analysisFailed ? (
            <InlineState
              danger
              title="图片分析中断"
              description={candidate.lastError ?? '候选已保存，不会因为本次失败丢失。'}
              actionLabel={loading ? '正在重试…' : '重新分析'}
              onAction={retry}
            />
          ) : insufficient ? (
            <InlineState
              title="证据不足"
              description={report?.evidenceMessage ?? '没有可用商品图或没有同类衣物。空结果不代表值得买。'}
              actionLabel={candidate.imageRelPath ? '重新分析' : undefined}
              onAction={candidate.imageRelPath ? retry : undefined}
            />
          ) : (
            <View style={styles.list}>
              {similarities.map((item, index) => (
                <Pressable
                  key={item.garmentId}
                  accessibilityRole="button"
                  accessibilityLabel={`查看衣物 ${item.name}`}
                  onPress={() => router.push(`/garment/${item.garmentId}`)}
                  style={styles.similarCard}
                >
                  <Text style={styles.rank}>{String(index + 1).padStart(2, '0')}</Text>
                  {item.imageRelPath ? (
                    <Image
                      source={{ uri: service.shoppingImageUri(item.imageRelPath) }}
                      style={styles.similarImage}
                      contentFit="contain"
                    />
                  ) : (
                    <View style={[styles.similarImage, styles.imageEmpty]}>
                      <Text style={styles.imageEmptyText}>暂无图片</Text>
                    </View>
                  )}
                  <View style={styles.similarBody}>
                    <View style={styles.nameRow}>
                      <Text style={styles.similarName}>{item.name}</Text>
                      <Text style={styles.totalScore}>{percent(item.totalScore)}</Text>
                    </View>
                    <Text style={styles.categoryGate}>同类门槛 · {CATEGORY_LABEL[item.category] ?? item.category}</Text>
                    <Metric
                      label="类别门槛"
                      score={percent(item.dimensions.category.score)}
                      weight={percent(item.dimensions.category.weight)}
                      contribution={percent(item.dimensions.category.contribution)}
                    />
                    <Metric
                      label="感知哈希"
                      score={percent(item.hashScore ?? item.dimensions.hash.score)}
                      weight={percent(item.dimensions.hash.weight)}
                      contribution={percent(item.dimensions.hash.contribution)}
                    />
                    <Metric
                      label="Lab 色彩"
                      score={percent(item.labScore ?? item.dimensions.lab.score)}
                      weight={percent(item.dimensions.lab.weight)}
                      contribution={percent(item.dimensions.lab.contribution)}
                    />
                    <Metric
                      label="轮廓"
                      score={percent(item.contourScore ?? item.dimensions.contour.score)}
                      weight={percent(item.dimensions.contour.weight)}
                      contribution={percent(item.dimensions.contour.contribution)}
                    />
                    <View style={styles.explanations}>
                      <Text style={styles.explanation}>· {item.dimensions.category.explanation}</Text>
                      <Text style={styles.explanation}>· {item.dimensions.hash.explanation}</Text>
                      <Text style={styles.explanation}>· {item.dimensions.lab.explanation}</Text>
                      <Text style={styles.explanation}>· {item.dimensions.contour.explanation}</Text>
                    </View>
                    <Text style={styles.openHint}>打开真实衣物</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}

          <Text style={styles.disclaimer}>相似度只描述重复证据，不替你做购买判断，也不会改变推荐排序。</Text>
        </>
      ) : null}
    </ShoppingShell>
  );
}

function Metric({
  label,
  score,
  weight,
  contribution,
}: {
  label: string;
  score: string;
  weight: string;
  contribution: string;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>分数 {score} · 权重 {weight} · 贡献 {contribution}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  muted: { ...typography.bodySm, color: palette.charcoalSoft },
  candidate: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.hairline,
  },
  candidateImage: { width: 112, height: 128, backgroundColor: palette.sandSoft },
  imageEmpty: { alignItems: 'center', justifyContent: 'center' },
  imageEmptyText: { ...typography.caption, color: palette.charcoalSoft, textAlign: 'center', padding: spacing.xs },
  candidateText: { flex: 1, paddingLeft: spacing.md },
  overline: { ...typography.caption, color: shoppingTextGold, letterSpacing: 1 },
  candidateName: { ...typography.title, color: palette.charcoal, marginTop: spacing.xxs },
  candidateMeta: { ...typography.bodySm, color: palette.charcoalSoft, marginTop: spacing.xs },
  summaryLine: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.lg },
  summaryNumber: { ...typography.display, color: shoppingTextGold, fontSize: 52, lineHeight: 58, marginRight: spacing.md },
  summaryText: { flex: 1 },
  summaryTitle: { ...typography.headline, color: palette.charcoal, marginBottom: spacing.xxs },
  list: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.hairline },
  similarCard: {
    minHeight: 184,
    flexDirection: 'row',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.hairline,
  },
  rank: { ...typography.caption, color: shoppingTextGold, width: 28, paddingTop: spacing.xxs },
  similarImage: { width: 88, height: 128, backgroundColor: palette.sandSoft },
  similarBody: { flex: 1, paddingLeft: spacing.md },
  nameRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  similarName: { ...typography.headline, color: palette.charcoal, flex: 1 },
  totalScore: { ...typography.title, color: shoppingTextGold },
  categoryGate: { ...typography.caption, color: palette.charcoalSoft, marginTop: spacing.xxs, marginBottom: spacing.xs },
  metric: { flexDirection: 'row', justifyContent: 'space-between', minHeight: 24, alignItems: 'center' },
  metricLabel: { ...typography.caption, color: palette.charcoalSoft },
  metricValue: { ...typography.bodySm, color: palette.charcoal },
  explanations: { marginTop: spacing.xs, paddingTop: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.hairline },
  explanation: { ...typography.caption, color: palette.charcoalSoft, marginTop: 2 },
  openHint: { ...typography.caption, color: palette.oxblood, marginTop: spacing.xs },
  disclaimer: {
    ...typography.caption,
    color: palette.charcoalSoft,
    borderLeftWidth: 2,
    borderLeftColor: palette.mutedGold,
    paddingLeft: spacing.sm,
    marginTop: spacing.lg,
  },
});
