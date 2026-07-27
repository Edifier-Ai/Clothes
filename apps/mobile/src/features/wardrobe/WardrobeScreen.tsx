import { EmptyStateCard } from '@/features/shell/EmptyStateCard';
import { TabShell } from '@/features/shell/TabShell';

/** 衣橱页（MVP-000 骨架态）：空衣橱状态。 */
export default function WardrobeScreen() {
  return (
    <TabShell title="衣橱" subtitle="0 件衣物">
      <EmptyStateCard
        eyebrow="02"
        title="衣橱还是空的"
        description="从相册导入或连续拍摄你的真实衣物。每件衣物保留原图、蒙版和缩略图，随时可以重新修边。"
        actionLabel="添加衣物"
        actionHint="导入与抠图流程将在 MVP-001/003 接通"
      />
    </TabShell>
  );
}
