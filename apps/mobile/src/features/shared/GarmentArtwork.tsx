import { StyleSheet, Text, View } from 'react-native';

import { palette, typography } from '@/design-system';

const COLOR_TONE: Record<string, string> = {
  白色: '#E8E4DC',
  蓝色: '#344A62',
  海军蓝: '#26384D',
  酒红色: '#762E3E',
  黑色: '#2B2A29',
  米色: '#C8B38F',
  驼色: '#A78058',
  灰色: '#646565',
  绿色: '#385848',
};

const CATEGORY_MARK: Record<string, string> = {
  top: 'TOP',
  bottom: 'BOTTOM',
  dress: 'DRESS',
  shoes: 'SHOES',
  outerwear: 'COAT',
  accessory: 'DETAIL',
  other: 'EDIT',
};

function toneFor(color?: string | null): string {
  return color ? COLOR_TONE[color] ?? palette.mutedGold : palette.mutedGold;
}

function Silhouette({ category, tone }: { category: string; tone: string }) {
  if (category === 'bottom') {
    return (
      <View style={styles.figure}>
        <View style={[styles.waist, { backgroundColor: tone }]} />
        <View style={[styles.leg, styles.legLeft, { backgroundColor: tone }]} />
        <View style={[styles.leg, styles.legRight, { backgroundColor: tone }]} />
      </View>
    );
  }
  if (category === 'shoes') {
    return (
      <View style={styles.figure}>
        <View style={[styles.shoe, styles.shoeLeft, { backgroundColor: tone }]} />
        <View style={[styles.shoe, styles.shoeRight, { backgroundColor: tone }]} />
      </View>
    );
  }
  if (category === 'dress') {
    return (
      <View style={styles.figure}>
        <View style={[styles.dressTop, { backgroundColor: tone }]} />
        <View style={[styles.dressSkirt, { borderBottomColor: tone }]} />
      </View>
    );
  }
  if (category === 'accessory') {
    return (
      <View style={styles.figure}>
        <View style={[styles.scarf, { borderColor: tone }]} />
        <View style={[styles.scarfTail, { backgroundColor: tone }]} />
      </View>
    );
  }
  return (
    <View style={styles.figure}>
      <View style={[styles.sleeve, styles.sleeveLeft, { backgroundColor: tone }]} />
      <View style={[styles.sleeve, styles.sleeveRight, { backgroundColor: tone }]} />
      <View
        style={[
          styles.torso,
          category === 'outerwear' && styles.outerTorso,
          { backgroundColor: tone },
        ]}
      >
        {category === 'outerwear' ? <View style={styles.lapel} /> : null}
      </View>
    </View>
  );
}

/** 无图片时的确定性服装视觉；用于演示数据，也让真实衣物缺图时不出现空白卡。 */
export function GarmentArtwork({
  category,
  color,
  compact = false,
}: {
  category: string;
  color?: string | null;
  compact?: boolean;
}) {
  const tone = toneFor(color);
  return (
    <View
      accessibilityLabel={`${CATEGORY_MARK[category] ?? 'EDIT'} 服装示意`}
      style={[styles.frame, compact && styles.frameCompact]}
    >
      <View style={styles.topRule} />
      <Silhouette category={category} tone={tone} />
      {!compact ? <Text style={styles.mark}>{CATEGORY_MARK[category] ?? 'EDIT'}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F0E8',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
  },
  frameCompact: { borderWidth: 0 },
  topRule: {
    position: 'absolute',
    left: '16%',
    right: '16%',
    top: '12%',
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.mutedGold,
  },
  figure: { width: '64%', height: '58%', alignItems: 'center', justifyContent: 'center' },
  torso: { width: '48%', height: '64%', borderRadius: 8 },
  outerTorso: { height: '76%', borderRadius: 4 },
  sleeve: { position: 'absolute', top: '19%', width: '24%', height: '48%', borderRadius: 7 },
  sleeveLeft: { left: '12%', transform: [{ rotate: '18deg' }] },
  sleeveRight: { right: '12%', transform: [{ rotate: '-18deg' }] },
  lapel: {
    width: '45%',
    height: '42%',
    alignSelf: 'center',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  waist: { position: 'absolute', top: '14%', width: '58%', height: '16%', borderRadius: 3 },
  leg: { position: 'absolute', top: '26%', width: '25%', height: '65%', borderRadius: 4 },
  legLeft: { left: '22%', transform: [{ rotate: '2deg' }] },
  legRight: { right: '22%', transform: [{ rotate: '-2deg' }] },
  shoe: { position: 'absolute', width: '54%', height: '24%', borderRadius: 18 },
  shoeLeft: { left: '4%', top: '30%', transform: [{ rotate: '-8deg' }] },
  shoeRight: { right: '4%', bottom: '24%', transform: [{ rotate: '8deg' }] },
  dressTop: { position: 'absolute', top: '6%', width: '34%', height: '38%', borderRadius: 8 },
  dressSkirt: {
    position: 'absolute',
    bottom: '3%',
    width: 0,
    height: 0,
    borderLeftWidth: 38,
    borderRightWidth: 38,
    borderBottomWidth: 58,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  scarf: { width: '48%', aspectRatio: 1, borderWidth: 8, transform: [{ rotate: '45deg' }] },
  scarfTail: { position: 'absolute', right: '17%', bottom: '7%', width: '13%', height: '46%', transform: [{ rotate: '18deg' }] },
  mark: {
    ...typography.caption,
    position: 'absolute',
    bottom: '8%',
    color: palette.charcoalSoft,
    minWidth: 48,
    textAlign: 'center',
    letterSpacing: 1.2,
    fontSize: 9,
  },
});
