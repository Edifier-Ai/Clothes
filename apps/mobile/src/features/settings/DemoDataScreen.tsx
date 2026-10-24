import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  defaultDemoDataService,
  type DemoDataService,
  type DemoDataSummary,
} from '@/core/demo/demoDataService';
import { palette, spacing, typography } from '@/design-system';
import { EditorialButton, MessagePanel, SettingsPage } from './SettingsUi';

function SummaryCard({ summary }: { summary: DemoDataSummary }) {
  const metrics = [
    [String(summary.garments), '件衣物'],
    [String(summary.looks), '套造型'],
    [String(summary.plans), '条计划'],
    [String(summary.wearDays), '天记录'],
  ] as const;
  return (
    <View style={styles.summary}>
      {metrics.map(([value, label]) => (
        <View key={label} style={styles.metric}>
          <Text style={styles.metricValue}>{value}</Text>
          <Text style={styles.metricLabel}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

export default function DemoDataScreen({
  demoService = defaultDemoDataService,
}: {
  demoService?: DemoDataService;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<DemoDataSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      setSummary(await demoService.load());
    } catch {
      setError('演示数据没有载入。原有衣橱保持不变，请重试。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SettingsPage
      title="演示数据"
      footer={
        summary ? (
          <EditorialButton label="开始体验" onPress={() => router.replace('/')} />
        ) : (
          <EditorialButton label="载入演示体验" onPress={() => void load()} loading={loading} />
        )
      }
    >
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>DEMO READY</Text>
        <Text style={styles.title}>一键装满可录屏的真实衣橱</Text>
        <Text style={styles.description}>
          54 件高清单品、18 套造型、计划日历、穿着洞察和购物判断会同时拥有连贯内容。
        </Text>
      </View>

      {summary ? (
        <>
          <MessagePanel
            tone="success"
            eyebrow="已准备完成"
            title="演示体验可以开始"
            description={`数据以 ${summary.anchorDate} 为今天生成；购物判断案例也已就绪。`}
          />
          <SummaryCard summary={summary} />
        </>
      ) : (
        <SummaryCard
          summary={{ anchorDate: '', garments: 54, looks: 18, plans: 7, wearDays: 20, shoppingCases: 1 }}
        />
      )}

      {error ? <MessagePanel tone="error" title="载入失败" description={error} /> : null}

      <MessagePanel
        tone="gold"
        eyebrow="数据边界"
        title="只重置内置演示内容"
        description="图片离线随 App 提供并复制到私有衣橱。再次载入只会替换 demo-v1 标记的数据，不会删除或覆盖你自己录入的衣物、造型与计划。"
      />
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  hero: { paddingVertical: spacing.lg },
  eyebrow: { ...typography.caption, color: palette.mutedGold, letterSpacing: 1.4 },
  title: { ...typography.display, color: palette.charcoal, marginTop: spacing.xs },
  description: { ...typography.body, color: palette.charcoalSoft, marginTop: spacing.sm },
  summary: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    paddingVertical: spacing.md,
  },
  metric: { flex: 1, alignItems: 'center' },
  metricValue: { ...typography.title, color: palette.oxblood },
  metricLabel: { ...typography.caption, color: palette.charcoalSoft, marginTop: spacing.xxs },
});
