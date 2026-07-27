import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlashList } from '@shopify/flash-list';
import { Pressable, StyleSheet, Text } from 'react-native';

import { hitTarget, palette, radius, spacing, typography } from '@/design-system';
import { originalUri } from '@/core/files/uri';
import { listGarments } from '@/core/garments/service';
import type { GarmentRow } from '@/core/db/schema';
import { EmptyStateCard } from '@/features/shell/EmptyStateCard';
import { TabShell } from '@/features/shell/TabShell';

const CATEGORY_LABEL: Record<string, string> = {
  top: '上装',
  bottom: '下装',
  dress: '连衣裙',
  shoes: '鞋',
  outerwear: '外套',
  accessory: '配饰',
  other: '其他',
};

/** 衣橱首页（CLS-01）：空态或真实衣物网格，数据来自本地 SQLite。 */
export default function WardrobeScreen() {
  const router = useRouter();
  const [items, setItems] = useState<GarmentRow[]>([]);

  useFocusEffect(
    useCallback(() => {
      listGarments().then(setItems);
    }, []),
  );

  return (
    <TabShell
      title="衣橱"
      subtitle={`${items.length} 件衣物`}
      trailing={
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/add-garment')}
          style={styles.addBtn}
        >
          <Text style={styles.addBtnLabel}>+ 添加</Text>
        </Pressable>
      }
    >
      {items.length === 0 ? (
        <EmptyStateCard
          eyebrow="02"
          title="衣橱还是空的"
          description="从相册导入或连续拍摄你的真实衣物。每件衣物保留原图、蒙版和缩略图，随时可以重新修边。"
          actionLabel="添加衣物"
          onAction={() => router.push('/add-garment')}
        />
      ) : (
        <FlashList
          data={items}
          keyExtractor={(it) => it.id}
          numColumns={2}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/garment/${item.id}`)}
              style={styles.card}
            >
              <Image source={{ uri: originalUri(`originals/${item.id}.jpg`) }} style={styles.thumb} contentFit="contain" />
              <Text style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.cat}>{CATEGORY_LABEL[item.category] ?? item.category}</Text>
            </Pressable>
          )}
        />
      )}
    </TabShell>
  );
}

const styles = StyleSheet.create({
  addBtn: {
    minHeight: hitTarget.min,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: palette.oxblood,
    marginLeft: spacing.sm,
  },
  addBtnLabel: { ...typography.bodySm, color: palette.white },
  grid: { padding: spacing.sm },
  card: {
    flex: 1,
    margin: spacing.xs,
    padding: spacing.xs,
    backgroundColor: palette.sandSoft,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
  },
  thumb: { width: '100%', height: 150, borderRadius: radius.md, backgroundColor: palette.white },
  name: { ...typography.bodySm, color: palette.charcoal, marginTop: spacing.xs },
  cat: { ...typography.caption, color: palette.charcoalSoft },
});
