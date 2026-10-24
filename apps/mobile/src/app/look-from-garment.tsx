import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { palette, typography } from '@/design-system';
import { HeroLookView } from '@/features/looks/HeroLookView';

/** 从单品创建路由（LOK-07）：query `hero=<garmentId>`，主体在 HeroLookView（可测）。 */
export default function LookFromGarmentRoute() {
  const { hero, garmentId } = useLocalSearchParams<{ hero?: string; garmentId?: string }>();
  const heroId = hero ?? garmentId;
  if (!heroId) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>缺少主角单品，请从衣物详情进入。</Text>
      </View>
    );
  }
  return <HeroLookView heroId={heroId} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: palette.paperWhite },
  muted: { ...typography.body, color: palette.charcoalSoft },
});
