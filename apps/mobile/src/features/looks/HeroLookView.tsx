import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { hitTarget, palette, radius, spacing, typography } from '@/design-system';
import type { LookItemInput } from '@/core/db/dao';
import type { LookSlot } from '@/core/db/schema';
import { getGarmentDetail, queryWardrobe } from '@/core/garments/service';
import type { GarmentForRec, Outfit } from '@/core/recommend';
import { saveLook } from '@/core/looks/lookService';
import { uuidv7 } from '@/core/id/uuidv7';
import { rebuildCover } from './coverCompose';
import { buildHeroDirections, type HeroDirection } from './heroDirections';
import { SLOT_LABEL, SLOT_LAYOUT, SLOT_ORDER } from './slotLayout';

export interface HeroLookViewProps {
  heroId: string;
}

const SLOT_OF_CATEGORY: Record<string, LookSlot> = {
  top: 'top',
  bottom: 'bottom',
  dress: 'dress',
  shoes: 'shoes',
  outerwear: 'outerwear',
  accessory: 'accessory',
};

/** Outfit → slots 明细（dress 只落一条，顶替 top+bottom）。 */
function outfitToItems(outfit: Outfit, names: Map<string, string>): LookItemInput[] {
  const uniq = new Map<string, { garment: GarmentForRec; slot: LookSlot }>();
  const put = (g: GarmentForRec | undefined) => {
    if (!g) return;
    const slot = SLOT_OF_CATEGORY[g.category];
    if (!slot || slot === 'accessory') return;
    if (g.category === 'dress') {
      uniq.set(g.id, { garment: g, slot: 'dress' });
    } else if (!uniq.has(g.id)) {
      uniq.set(g.id, { garment: g, slot });
    }
  };
  put(outfit.top);
  if (outfit.top.id !== outfit.bottom.id) put(outfit.bottom);
  put(outfit.shoes);
  put(outfit.outerwear);
  void names;
  return [...uniq.values()].map(({ garment, slot }) => ({
    id: uuidv7(),
    garmentId: garment.id,
    slot,
    ...SLOT_LAYOUT[slot],
    rotation: 0,
    zIndex: SLOT_ORDER.indexOf(slot),
    ord: 0,
  }));
}

/**
 * 从主角单品创建（LOK-07）：推荐引擎围绕 hero 生成 3 个组合方向
 * （稳妥/新鲜/主角，合法槽位、可用衣物、确定性），「采用这套」保存为 slots 造型。
 */
export function HeroLookView({ heroId }: HeroLookViewProps) {
  const router = useRouter();
  const [heroName, setHeroName] = useState<string | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [directions, setDirections] = useState<HeroDirection[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const detail = await getGarmentDetail(heroId).catch(() => null);
    setHeroName(detail?.garment.name ?? null);
    const entries = await queryWardrobe({}, 'recentAdded').catch(() => []);
    const nameMap = new Map<string, string>();
    const pool: GarmentForRec[] = entries.map((e) => {
      nameMap.set(e.item.garment.id, e.item.garment.name);
      return {
        id: e.item.garment.id,
        category: e.item.garment.category as GarmentForRec['category'],
        status: e.item.garment.status as GarmentForRec['status'],
        createdAt: e.item.garment.createdAt,
        updatedAt: e.item.garment.updatedAt,
        lastWornAt: e.item.lastWornAt,
        timesWorn: e.item.timesWorn,
        archivedAt: e.item.garment.archivedAt,
      };
    });
    setNames(nameMap);
    setDirections(
      buildHeroDirections(heroId, pool, { now: Date.now(), occasion: null, weatherTempC: null, recentItemIds: [] }),
    );
  }, [heroId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const adopt = async (d: HeroDirection) => {
    if (!d.outfit || busy) return;
    setBusy(true);
    setError(null);
    try {
      const items = outfitToItems(d.outfit, names);
      const detail = await saveLook({
        name: heroName ? `${heroName}的搭配` : '未命名造型',
        mode: 'slots',
        items,
      });
      // 封面合成失败不阻塞保存（rebuildCover 内部已吞错）
      rebuildCover(detail.look.id).catch(() => undefined);
      router.replace(`/look/${detail.look.id}`);
    } catch {
      setError('保存失败，请重试');
      setBusy(false);
    }
  };

  const outfitLines = (o: Outfit): { slot: string; name: string }[] => {
    const lines: { slot: string; name: string }[] = [];
    const isDress = o.top.category === 'dress';
    if (isDress) {
      lines.push({ slot: SLOT_LABEL.dress, name: names.get(o.top.id) ?? o.top.id });
    } else {
      lines.push({ slot: SLOT_LABEL.top, name: names.get(o.top.id) ?? o.top.id });
      lines.push({ slot: SLOT_LABEL.bottom, name: names.get(o.bottom.id) ?? o.bottom.id });
    }
    lines.push({ slot: SLOT_LABEL.shoes, name: names.get(o.shoes.id) ?? o.shoes.id });
    if (o.outerwear) lines.push({ slot: SLOT_LABEL.outerwear, name: names.get(o.outerwear.id) ?? o.outerwear.id });
    return lines;
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>由此创建造型</Text>
        <Text style={styles.subtitle}>
          围绕主角单品{heroName ? `「${heroName}」` : ''}生成 3 个组合方向，采用后可继续编辑。
        </Text>

        {directions === null ? (
          <ActivityIndicator color={palette.oxblood} style={styles.loading} />
        ) : (
          directions.map((d) => (
            <View key={d.mode} style={styles.card}>
              <Text style={styles.cardTitle}>{d.label}</Text>
              {d.outfit ? (
                <>
                  {outfitLines(d.outfit).map((l) => (
                    <Text key={`${d.mode}-${l.slot}`} style={styles.line}>
                      {l.slot} · {l.name}
                    </Text>
                  ))}
                </>
              ) : (
                <Text style={styles.missing}>衣橱暂缺可组合的单品，先补充上装、下装或鞋。</Text>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !d.outfit || busy }}
                disabled={!d.outfit || busy}
                onPress={() => adopt(d)}
                style={[styles.adoptBtn, (!d.outfit || busy) && styles.adoptBtnDisabled]}
              >
                <Text style={styles.adoptLabel}>采用这套</Text>
              </Pressable>
            </View>
          ))
        )}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.paperWhite },
  container: { padding: spacing.lg },
  title: { ...typography.title, color: palette.charcoal },
  subtitle: { ...typography.bodySm, color: palette.charcoalSoft, marginTop: spacing.xxs, marginBottom: spacing.md },
  loading: { marginTop: spacing.xl },
  card: {
    marginBottom: spacing.md,
    padding: spacing.md,
    backgroundColor: palette.sandSoft,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
  },
  cardTitle: { ...typography.headline, color: palette.charcoal, marginBottom: spacing.xs },
  line: { ...typography.bodySm, color: palette.charcoal, marginTop: spacing.xxs },
  missing: { ...typography.bodySm, color: palette.charcoalSoft },
  adoptBtn: {
    marginTop: spacing.sm,
    minHeight: hitTarget.preferred,
    borderRadius: radius.md,
    backgroundColor: palette.oxblood,
    justifyContent: 'center',
    alignItems: 'center',
  },
  adoptBtnDisabled: { backgroundColor: palette.hairline },
  adoptLabel: { ...typography.body, color: palette.white },
  errorText: { ...typography.bodySm, color: palette.danger, marginTop: spacing.sm },
});
