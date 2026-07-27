import { StyleSheet, Text, View } from 'react-native';

import { palette, spacing, typography } from '@/design-system';
import { EmptyStateCard } from '@/features/shell/EmptyStateCard';
import { TabShell } from '@/features/shell/TabShell';

/** 今日页（MVP-000 骨架态）：衣橱未就绪时如实展示空状态。 */
export default function TodayScreen() {
  const today = new Date().toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  return (
    <TabShell title="今天" subtitle={today}>
      <View style={styles.stage}>
        <Text style={styles.stageNumber}>—</Text>
        <Text style={styles.stageLabel}>尚无今日搭配</Text>
      </View>
      <EmptyStateCard
        eyebrow="01"
        title="先整理 12 件常穿衣物"
        description="录入 6 件即可预览第一套搭配，录满 12 件解锁可解释的今日推荐。照片只在本机处理，原图不会被覆盖。"
        actionLabel="开始整理衣橱"
        actionHint="首次激活流程将在 MVP-004 接通"
      />
    </TabShell>
  );
}

const styles = StyleSheet.create({
  stage: {
    alignItems: 'center',
    paddingTop: spacing.xxl,
    paddingBottom: spacing.lg,
  },
  stageNumber: {
    ...typography.display,
    color: palette.mutedGold,
  },
  stageLabel: {
    ...typography.bodySm,
    color: palette.charcoalSoft,
    marginTop: spacing.xs,
  },
});
