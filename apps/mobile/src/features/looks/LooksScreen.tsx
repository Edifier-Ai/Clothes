import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlashList } from '@shopify/flash-list';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { hitTarget, palette, radius, spacing, typography } from '@/design-system';
import type { LookDetail } from '@/core/db/dao';
import { listLooks } from '@/core/looks/lookService';
import { EmptyStateCard } from '@/features/shell/EmptyStateCard';
import { TabShell } from '@/features/shell/TabShell';
import { LookCover } from './LookCover';

const MODE_LABEL: Record<string, string> = { slots: '快速槽位', canvas: '自由画布' };

/**
 * 造型图库（LOK-01）：真实造型网格（封面缓存优先、实时合成兜底）、计数、
 * 空态引导与新建入口（快速槽位 / 自由画布）。
 */
export default function LooksScreen() {
  const router = useRouter();
  const [looks, setLooks] = useState<LookDetail[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(() => {
    listLooks()
      .then((rows) => {
        setLooks(rows);
        setError(null);
      })
      .catch(() => setError('造型加载失败，请重试'));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const openEditor = (mode: 'slots' | 'canvas') => {
    setCreateOpen(false);
    router.push({ pathname: '/look-editor', params: { mode } });
  };

  return (
    <TabShell
      title="造型"
      subtitle={`${looks.length} 套造型`}
      trailing={
        <Pressable accessibilityRole="button" onPress={() => setCreateOpen((o) => !o)} style={styles.addBtn}>
          <Text style={styles.addBtnLabel}>+ 新建</Text>
        </Pressable>
      }
    >
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {looks.length === 0 ? (
        <EmptyStateCard
          eyebrow="03"
          title="还没有造型"
          description="用快速槽位按上装/下装/鞋组合，或在自由画布上随意摆放、缩放、旋转你的真实衣物。"
          actionLabel="新建造型"
          onAction={() => setCreateOpen(true)}
        />
      ) : (
        <FlashList
          data={looks}
          keyExtractor={(d) => d.look.id}
          numColumns={2}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/look/${item.look.id}`)}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            >
              <LookCover lookId={item.look.id} coverRelPath={item.look.coverRelPath} width={160} height={160} />
              <Text style={styles.name} numberOfLines={1}>
                {item.look.name}
              </Text>
              <Text style={styles.meta}>
                {MODE_LABEL[item.look.mode] ?? item.look.mode} · {item.items.length} 件
              </Text>
            </Pressable>
          )}
        />
      )}

      {createOpen ? (
        <View style={styles.createPanel}>
          <Text style={styles.createTitle}>新建造型</Text>
          <Pressable accessibilityRole="button" onPress={() => openEditor('slots')} style={styles.createBtn}>
            <Text style={styles.createBtnLabel}>快速槽位</Text>
            <Text style={styles.createBtnHint}>按上装/下装/鞋（或连衣裙+鞋）组合，自动校验可穿</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => openEditor('canvas')} style={styles.createBtn}>
            <Text style={styles.createBtnLabel}>自由画布</Text>
            <Text style={styles.createBtnHint}>任意摆放、缩放、旋转与分层，不自动判定可穿</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setCreateOpen(false)} style={styles.createCancel}>
            <Text style={styles.createCancelLabel}>取消</Text>
          </Pressable>
        </View>
      ) : null}
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
  errorText: { ...typography.bodySm, color: palette.danger, paddingHorizontal: spacing.sm },
  grid: { padding: spacing.sm },
  card: {
    flex: 1,
    margin: spacing.xs,
    padding: spacing.xs,
    backgroundColor: palette.sandSoft,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    alignItems: 'center',
  },
  cardPressed: { backgroundColor: palette.sand },
  name: { ...typography.bodySm, color: palette.charcoal, marginTop: spacing.xs, alignSelf: 'flex-start' },
  meta: { ...typography.caption, color: palette.charcoalSoft, alignSelf: 'flex-start' },
  createPanel: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    padding: spacing.md,
    backgroundColor: palette.white,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    gap: spacing.sm,
  },
  createTitle: { ...typography.headline, color: palette.charcoal },
  createBtn: {
    minHeight: hitTarget.preferred,
    borderRadius: radius.md,
    backgroundColor: palette.sandSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  createBtnLabel: { ...typography.body, color: palette.oxblood },
  createBtnHint: { ...typography.caption, color: palette.charcoalSoft },
  createCancel: { minHeight: hitTarget.min, justifyContent: 'center', alignItems: 'center' },
  createCancelLabel: { ...typography.bodySm, color: palette.charcoalSoft },
});
