import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { palette, typography } from '@/design-system';
import { LookDetailView } from '@/features/looks/LookDetailView';

/** 造型详情路由（LOK-05/06）：主体在 features/looks/LookDetailView（可测）。 */
export default function LookDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>造型不存在或已删除</Text>
      </View>
    );
  }
  return <LookDetailView lookId={id} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: palette.paperWhite },
  muted: { ...typography.body, color: palette.charcoalSoft },
});
