import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlashList } from '@shopify/flash-list';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { hitTarget, palette, radius, spacing, typography } from '@/design-system';
import { originalUri } from '@/core/files/uri';
import {
  batchUpdate,
  queryWardrobe,
  type CareStatus,
  type WardrobeEntry,
  type WardrobeFilter,
  type WardrobeSort,
} from '@/core/garments/service';
import { isFilterActive } from '@/core/wardrobe/search';
import type { GarmentCategory, GarmentStatus, TagKind } from '@/core/db/schema';
import { EmptyStateCard } from '@/features/shell/EmptyStateCard';
import { TabShell } from '@/features/shell/TabShell';
import { GarmentArtwork } from '@/features/shared/GarmentArtwork';

const CATEGORY_LABEL: Record<string, string> = {
  top: '上装',
  bottom: '下装',
  dress: '连衣裙',
  shoes: '鞋',
  outerwear: '外套',
  accessory: '配饰',
  other: '其他',
};

const STATUS_LABEL: Record<string, string> = {
  clean: '干净',
  laundry: '待洗',
  dryclean: '干洗',
  loaned: '借出',
  worn: '穿过',
  wishlist: '心愿单',
  archived: '已归档',
};

const CARE_STATUSES: CareStatus[] = ['clean', 'laundry', 'dryclean', 'loaned'];

const SORT_LABEL: Record<WardrobeSort, string> = {
  recentAdded: '最近添加',
  leastWorn: '穿得最少',
  leastRecentlyWorn: '最久未穿',
};

const TAG_KIND_LABEL: Record<string, string> = {
  color: '颜色',
  season: '季节',
  occasion: '场景',
  brand: '品牌',
  note: '备注',
};

const NOT_WORN_DAYS = 30;

function Chip(props: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      style={[styles.chip, props.active && styles.chipActive]}
    >
      <Text style={[styles.chipText, props.active && styles.chipTextActive]}>{props.label}</Text>
    </Pressable>
  );
}

/** 衣橱首页（CLS-01/02/07/08）：搜索、组合筛选、批量操作、归档区与恢复。 */
export default function WardrobeScreen() {
  const router = useRouter();
  const [entries, setEntries] = useState<WardrobeEntry[]>([]);
  const [allItems, setAllItems] = useState<WardrobeEntry[]>([]);
  const [filter, setFilter] = useState<WardrobeFilter>({});
  const [sort, setSort] = useState<WardrobeSort>('recentAdded');
  const [panelOpen, setPanelOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [tagDraft, setTagDraft] = useState<{ kind: TagKind; value: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    queryWardrobe(filter, sort).then(setEntries).catch(() => setError('衣橱加载失败，请重试'));
  }, [filter, sort]);

  useFocusEffect(
    useCallback(() => {
      load();
      // 未筛选全集仅用于派生筛选维度可选值（颜色/季节/场景）
      queryWardrobe({}, 'recentAdded').then(setAllItems).catch(() => undefined);
    }, [load]),
  );
  useEffect(load, [load]);

  const facets = useMemo(() => {
    const pick = (kind: string) =>
      [...new Set(allItems.flatMap((e) => e.item.tags.filter((t) => t.kind === kind).map((t) => t.value)))].sort();
    return { colors: pick('color'), seasons: pick('season'), occasions: pick('occasion') };
  }, [allItems]);

  const setF = (patch: Partial<WardrobeFilter>) => setFilter((f) => ({ ...f, ...patch }));
  const toggle = <K extends keyof WardrobeFilter>(key: K, value: WardrobeFilter[K]) =>
    setFilter((f) => ({ ...f, [key]: f[key] === value ? undefined : value }));

  const filterActive = isFilterActive(filter);
  const inArchive = filter.status === 'archived';
  const selecting = selected !== null;

  const runBatch = async (patch: Parameters<typeof batchUpdate>[1]) => {
    if (!selected || selected.size === 0) return;
    setError(null);
    try {
      await batchUpdate([...selected], patch);
      setSelected(null);
      setTagDraft(null);
      load();
    } catch {
      setError('批量操作未生效：已整体回滚，请检查后重试');
    }
  };

  const toggleSelect = (id: string) =>
    setSelected((s) => {
      if (s === null) return s;
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <TabShell
      title="衣橱"
      subtitle={inArchive ? `已归档 · ${entries.length} 件` : `${entries.length} 件衣物`}
      trailing={
        <View style={styles.trailingRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="查看衣橱洞察"
            onPress={() => router.push('/insights')}
            style={styles.insightBtn}
          >
            <Text style={styles.insightBtnLabel}>洞察</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="添加衣物"
            onPress={() => router.push('/batch-import')}
            style={styles.addBtn}
          >
            <Text style={styles.addBtnLabel}>+ 添加</Text>
          </Pressable>
        </View>
      }
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="打开购物守门"
        onPress={() => router.push('/shopping')}
        style={styles.shoppingEntry}
      >
        <View style={styles.shoppingEntryText}>
          <Text style={styles.shoppingEyebrow}>买前检查</Text>
          <Text style={styles.shoppingTitle}>衣橱里已有相似款吗？</Text>
          <Text style={styles.shoppingHint}>用真实衣物查重、试搭并估算成本/次</Text>
        </View>
        <Ionicons name="arrow-forward-outline" size={20} color={palette.charcoal} />
      </Pressable>
      <View style={styles.searchRow}>
        <TextInput
          value={filter.text ?? ''}
          onChangeText={(v) => setF({ text: v })}
          placeholder="搜索名称、品牌或备注"
          placeholderTextColor={palette.charcoalSoft}
          style={styles.searchInput}
          accessibilityLabel="搜索衣物"
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => setPanelOpen((o) => !o)}
          style={[styles.filterBtn, filterActive && styles.chipActive]}
        >
          <Text style={[styles.filterBtnText, filterActive && styles.chipTextActive]}>
            筛选{filterActive ? '·' : ''}
          </Text>
        </Pressable>
      </View>

      {panelOpen ? (
        <View style={styles.panel}>
          <Text style={styles.panelLabel}>状态</Text>
          <View style={styles.chipRow}>
            {([...CARE_STATUSES, 'archived'] as (GarmentStatus | 'archived')[]).map((s) => (
              <Chip key={s} label={STATUS_LABEL[s]} active={filter.status === s} onPress={() => toggle('status', s)} />
            ))}
          </View>
          <Text style={styles.panelLabel}>类别</Text>
          <View style={styles.chipRow}>
            {(Object.keys(CATEGORY_LABEL) as GarmentCategory[]).map((c) => (
              <Chip key={c} label={CATEGORY_LABEL[c]} active={filter.category === c} onPress={() => toggle('category', c)} />
            ))}
          </View>
          {facets.colors.length > 0 ? (
            <>
              <Text style={styles.panelLabel}>颜色</Text>
              <View style={styles.chipRow}>
                {facets.colors.map((c) => (
                  <Chip key={c} label={c} active={filter.color === c} onPress={() => toggle('color', c)} />
                ))}
              </View>
            </>
          ) : null}
          {facets.seasons.length > 0 ? (
            <>
              <Text style={styles.panelLabel}>季节</Text>
              <View style={styles.chipRow}>
                {facets.seasons.map((s) => (
                  <Chip key={s} label={s} active={filter.season === s} onPress={() => toggle('season', s)} />
                ))}
              </View>
            </>
          ) : null}
          {facets.occasions.length > 0 ? (
            <>
              <Text style={styles.panelLabel}>场景</Text>
              <View style={styles.chipRow}>
                {facets.occasions.map((o) => (
                  <Chip key={o} label={o} active={filter.occasion === o} onPress={() => toggle('occasion', o)} />
                ))}
              </View>
            </>
          ) : null}
          <Text style={styles.panelLabel}>穿着</Text>
          <View style={styles.chipRow}>
            <Chip
              label={`${NOT_WORN_DAYS} 天没穿`}
              active={filter.notWornDays === NOT_WORN_DAYS}
              onPress={() => toggle('notWornDays', NOT_WORN_DAYS)}
            />
          </View>
          <Text style={styles.panelLabel}>排序</Text>
          <View style={styles.chipRow}>
            {(Object.keys(SORT_LABEL) as WardrobeSort[]).map((s) => (
              <Chip key={s} label={SORT_LABEL[s]} active={sort === s} onPress={() => setSort(s)} />
            ))}
          </View>
          {filterActive ? (
            <Pressable accessibilityRole="button" onPress={() => setFilter({})} style={styles.clearBtn}>
              <Text style={styles.clearBtnText}>清空筛选</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {entries.length === 0 ? (
        filterActive ? (
          <EmptyStateCard
            eyebrow="02"
            title="没有符合条件的衣物"
            description="当前筛选条件没有命中。条件已保留，可调整后重试，或一键清空。"
            actionLabel="清空筛选"
            onAction={() => setFilter({})}
          />
        ) : inArchive ? (
          <EmptyStateCard
            eyebrow="02"
            title="没有已归档的衣物"
            description="归档的衣物会从衣橱和推荐中移除，但保留全部历史，随时可以恢复。"
            actionLabel="返回衣橱"
            onAction={() => setFilter({})}
          />
        ) : (
          <EmptyStateCard
            eyebrow="02"
            title="衣橱还是空的"
            description="从相册导入或连续拍摄你的真实衣物。每件衣物保留原图、蒙版和缩略图，随时可以重新修边。"
            actionLabel="添加衣物"
            onAction={() => router.push('/batch-import')}
          />
        )
      ) : (
        <FlashList
          data={entries}
          keyExtractor={(it) => it.item.garment.id}
          numColumns={2}
          contentContainerStyle={styles.grid}
          renderItem={({ item: entry }) => {
            const g = entry.item.garment;
            const checked = selected?.has(g.id) ?? false;
            return (
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  selecting ? toggleSelect(g.id) : router.push(`/garment/${g.id}`)
                }
                onLongPress={() => setSelected(new Set([g.id]))}
                style={[styles.card, checked && styles.cardChecked]}
              >
                {entry.imageRelPath ? (
                  <Image source={{ uri: originalUri(entry.imageRelPath) }} style={styles.thumb} contentFit="contain" />
                ) : (
                  <View style={styles.thumb}>
                    <GarmentArtwork
                      category={g.category}
                      color={entry.item.tags.find((tag) => tag.kind === 'color')?.value}
                    />
                  </View>
                )}
                {selecting ? (
                  <View style={[styles.check, checked && styles.checkOn]}>
                    <Text style={styles.checkText}>{checked ? '✓' : ''}</Text>
                  </View>
                ) : null}
                <Text style={styles.name} numberOfLines={1}>
                  {g.name}
                </Text>
                <Text style={styles.cat}>
                  {CATEGORY_LABEL[g.category] ?? g.category} · {STATUS_LABEL[g.status] ?? g.status}
                </Text>
              </Pressable>
            );
          }}
        />
      )}

      {selecting ? (
        <View style={styles.batchBar}>
          <Text style={styles.batchCount}>已选 {selected.size} 件</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.batchActions}>
              {inArchive ? (
                <Chip label="恢复" active={false} onPress={() => runBatch({ archive: false })} />
              ) : (
                <>
                  {CARE_STATUSES.map((s) => (
                    <Chip key={s} label={STATUS_LABEL[s]} active={false} onPress={() => runBatch({ status: s })} />
                  ))}
                  <Chip
                    label="加标签"
                    active={false}
                    onPress={() => setTagDraft({ kind: 'note', value: '' })}
                  />
                  <Chip label="归档" active={false} onPress={() => runBatch({ archive: true })} />
                </>
              )}
              <Chip label="取消" active={false} onPress={() => setSelected(null)} />
            </View>
          </ScrollView>
        </View>
      ) : null}

      {tagDraft ? (
        <View style={styles.tagModal}>
          <Text style={styles.panelLabel}>批量加标签（{selected?.size ?? 0} 件）</Text>
          <View style={styles.chipRow}>
            {(Object.keys(TAG_KIND_LABEL) as TagKind[]).map((k) => (
              <Chip
                key={k}
                label={TAG_KIND_LABEL[k]}
                active={tagDraft.kind === k}
                onPress={() => setTagDraft({ ...tagDraft, kind: k })}
              />
            ))}
          </View>
          <TextInput
            value={tagDraft.value}
            onChangeText={(v) => setTagDraft({ ...tagDraft, value: v })}
            placeholder="标签内容"
            placeholderTextColor={palette.charcoalSoft}
            style={styles.searchInput}
            accessibilityLabel="标签内容"
          />
          <View style={styles.tagModalActions}>
            <Pressable accessibilityRole="button" onPress={() => setTagDraft(null)} style={styles.secondary}>
              <Text style={styles.secondaryLabel}>取消</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={!tagDraft.value.trim()}
              onPress={() => runBatch({ addTag: { kind: tagDraft.kind, value: tagDraft.value.trim() } })}
              style={styles.primary}
            >
              <Text style={styles.primaryLabel}>确认</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </TabShell>
  );
}

const styles = StyleSheet.create({
  shoppingEntry: {
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.sm,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
  },
  shoppingEntryText: { flex: 1, paddingRight: spacing.sm },
  shoppingEyebrow: { ...typography.caption, color: palette.mutedGold, letterSpacing: 1 },
  shoppingTitle: { ...typography.body, color: palette.charcoal, marginTop: 2 },
  shoppingHint: { ...typography.caption, color: palette.charcoalSoft, marginTop: 2 },
  trailingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  insightBtn: {
    minHeight: hitTarget.min,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.mutedGold,
  },
  insightBtnLabel: { ...typography.bodySm, color: palette.mutedGold },
  addBtn: {
    minHeight: hitTarget.min,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: palette.oxblood,
  },
  addBtnLabel: { ...typography.bodySm, color: palette.white },
  searchRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.sm, marginBottom: spacing.xs },
  searchInput: {
    ...typography.body,
    flex: 1,
    color: palette.charcoal,
    backgroundColor: palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    minHeight: hitTarget.min,
  },
  filterBtn: {
    minWidth: 64,
    minHeight: hitTarget.min,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
  },
  filterBtnText: { ...typography.bodySm, color: palette.charcoal },
  panel: { paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
  panelLabel: { ...typography.caption, color: palette.charcoalSoft, marginTop: spacing.xs, marginBottom: spacing.xxs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
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
  clearBtn: { marginTop: spacing.sm, minHeight: hitTarget.min, justifyContent: 'center' },
  clearBtnText: { ...typography.bodySm, color: palette.oxblood },
  errorText: { ...typography.bodySm, color: palette.danger, paddingHorizontal: spacing.sm, marginBottom: spacing.xs },
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
  cardChecked: { borderColor: palette.oxblood, borderWidth: 2 },
  thumb: { width: '100%', height: 150, borderRadius: radius.md, backgroundColor: palette.white },
  check: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    backgroundColor: palette.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkOn: { backgroundColor: palette.oxblood, borderColor: palette.oxblood },
  checkText: { ...typography.bodySm, color: palette.white },
  name: { ...typography.bodySm, color: palette.charcoal, marginTop: spacing.xs },
  cat: { ...typography.caption, color: palette.charcoalSoft },
  batchBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.hairline,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: palette.paperWhite,
  },
  batchCount: { ...typography.bodySm, color: palette.charcoal, marginBottom: spacing.xs },
  batchActions: { flexDirection: 'row', gap: spacing.xs },
  tagModal: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.hairline,
    padding: spacing.sm,
    backgroundColor: palette.sandSoft,
    gap: spacing.xs,
  },
  tagModalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  primary: { flex: 1, minHeight: hitTarget.preferred, borderRadius: radius.md, backgroundColor: palette.oxblood, justifyContent: 'center', alignItems: 'center' },
  primaryLabel: { ...typography.body, color: palette.white },
  secondary: { flex: 1, minHeight: hitTarget.preferred, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.hairline, justifyContent: 'center', alignItems: 'center' },
  secondaryLabel: { ...typography.body, color: palette.charcoal },
});
