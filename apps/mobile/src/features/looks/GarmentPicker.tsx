import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { hitTarget, palette, radius, spacing, typography } from '@/design-system';
import type { GarmentCategory, LookSlot } from '@/core/db/schema';
import { originalUri } from '@/core/files/uri';
import { filterPickCandidates, isPickAvailable, slotCategories, type PickCandidate } from './pickFilter';

const CATEGORY_LABEL: Record<string, string> = {
  top: '上装',
  bottom: '下装',
  dress: '连衣裙',
  shoes: '鞋',
  outerwear: '外套',
  accessory: '配饰',
  other: '其他',
};

export interface GarmentPickerProps {
  candidates: readonly PickCandidate[];
  /** 快速模式：按槽位限定类别；null = 画布模式全类别。 */
  slot: LookSlot | null;
  /** 已在造型中的衣物 id（打已选标记）。 */
  selectedIds: ReadonlySet<string>;
  onPick: (candidate: PickCandidate) => void;
  onClose: () => void;
}

/**
 * 选衣面板（LOK-04）：搜索（名称/品牌/备注）、分类 chips、已选标记、
 * 「只看可用」开关；快速模式按槽位过滤类别。过滤逻辑见 pickFilter.ts（纯函数）。
 * 以覆盖式 Modal 呈现：不参与调用方布局，槽位网格/页脚占满屏幕时
 * 也不会被挤出屏外（MVP-008 缺陷 1 修复）。
 */
export function GarmentPicker({ candidates, slot, selectedIds, onPick, onClose }: GarmentPickerProps) {
  const [text, setText] = useState('');
  const [category, setCategory] = useState<GarmentCategory | null>(null);
  const [onlyAvailable, setOnlyAvailable] = useState(true);

  const allowedCats = slotCategories(slot);
  const chipCats = allowedCats ?? (Object.keys(CATEGORY_LABEL) as GarmentCategory[]);

  const results = useMemo(
    () => filterPickCandidates(candidates, { text, category, onlyAvailable, slot }),
    [candidates, text, category, onlyAvailable, slot],
  );

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} testID="garment-picker-modal">
      <View style={styles.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel="关闭选衣面板" onPress={onClose} style={styles.backdrop} />
        <View style={styles.sheet} testID="garment-picker-sheet">
          <View style={styles.headRow}>
            <Text style={styles.title}>
              {slot ? `选择${CATEGORY_LABEL[slot] ?? slot}` : '添加单品'}
            </Text>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>完成</Text>
            </Pressable>
          </View>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="搜索名称、品牌或备注"
            placeholderTextColor={palette.charcoalSoft}
            style={styles.search}
            accessibilityLabel="搜索衣物"
          />
          <View style={styles.chipRow}>
            {chipCats.map((c) => (
              <Pressable
                key={c}
                accessibilityRole="button"
                onPress={() => setCategory((cur) => (cur === c ? null : c))}
                style={[styles.chip, category === c && styles.chipActive]}
              >
                <Text style={[styles.chipText, category === c && styles.chipTextActive]}>
                  {CATEGORY_LABEL[c] ?? c}
                </Text>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: onlyAvailable }}
              onPress={() => setOnlyAvailable((v) => !v)}
              style={[styles.chip, onlyAvailable && styles.chipActive]}
            >
              <Text style={[styles.chipText, onlyAvailable && styles.chipTextActive]}>只看可用</Text>
            </Pressable>
          </View>
          {results.length === 0 ? (
            <Text style={styles.empty}>没有符合条件的衣物，可调整搜索或筛选。</Text>
          ) : (
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {results.map((c) => {
                const picked = selectedIds.has(c.id);
                const usable = isPickAvailable(c);
                return (
                  <Pressable
                    key={c.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: picked }}
                    onPress={() => onPick(c)}
                    style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                  >
                    {(c.thumbnailRelPath ?? c.imageRelPath) != null ? (
                      <Image
                        source={{ uri: originalUri((c.thumbnailRelPath ?? c.imageRelPath) as string) }}
                        style={styles.thumb}
                        contentFit="contain"
                      />
                    ) : (
                      <View style={[styles.thumb, styles.thumbEmpty]} />
                    )}
                    <View style={styles.rowText}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {c.name}
                      </Text>
                      <Text style={styles.rowMeta}>
                        {CATEGORY_LABEL[c.category] ?? c.category}
                        {usable ? '' : ' · 不可用'}
                      </Text>
                    </View>
                    {picked ? <Text style={styles.pickedMark}>已选 ✓</Text> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.32)' },
  sheet: {
    maxHeight: '82%',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    overflow: 'hidden',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.hairline,
    backgroundColor: palette.paperWhite,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  title: { ...typography.headline, color: palette.charcoal },
  closeBtn: { minHeight: hitTarget.min, minWidth: hitTarget.min, justifyContent: 'center', alignItems: 'flex-end' },
  closeText: { ...typography.bodySm, color: palette.oxblood },
  search: {
    ...typography.body,
    color: palette.charcoal,
    backgroundColor: palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    minHeight: hitTarget.min,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
  },
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
  empty: { ...typography.bodySm, color: palette.charcoalSoft, padding: spacing.lg },
  list: { marginTop: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    minHeight: hitTarget.preferred,
    paddingVertical: spacing.xs,
  },
  rowPressed: { backgroundColor: palette.sandSoft },
  thumb: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: palette.sandSoft },
  thumbEmpty: { borderWidth: StyleSheet.hairlineWidth, borderColor: palette.hairline },
  rowText: { flex: 1 },
  rowName: { ...typography.body, color: palette.charcoal },
  rowMeta: { ...typography.caption, color: palette.charcoalSoft },
  pickedMark: { ...typography.bodySm, color: palette.oxblood },
});
