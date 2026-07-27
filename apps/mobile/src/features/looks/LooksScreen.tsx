import { EmptyStateCard } from '@/features/shell/EmptyStateCard';
import { TabShell } from '@/features/shell/TabShell';

/** 造型页（MVP-000 骨架态）：空造型库状态。 */
export default function LooksScreen() {
  return (
    <TabShell title="造型" subtitle="0 套造型">
      <EmptyStateCard
        eyebrow="03"
        title="还没有造型"
        description="衣橱就绪后，用快速槽位或自由画布把真实衣物组成造型，并安排到日历。"
        actionLabel="新建造型"
        actionHint="造型画布将在 MVP-008 接通"
      />
    </TabShell>
  );
}
