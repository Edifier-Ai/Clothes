import { EmptyStateCard } from '@/features/shell/EmptyStateCard';
import { TabShell } from '@/features/shell/TabShell';

/** 计划页（MVP-000 骨架态）：日历与旅行均未开始。 */
export default function PlanScreen() {
  return (
    <TabShell title="计划" subtitle="日历 · 旅行">
      <EmptyStateCard
        eyebrow="04"
        title="还没有计划"
        description="把造型安排到日期，或创建旅行并生成去重打包清单。所有计划离线可用。"
        actionLabel="添加计划"
        actionHint="日历与旅行将在 MVP-009/010 接通"
      />
    </TabShell>
  );
}
