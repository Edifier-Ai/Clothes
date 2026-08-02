import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { palette, typography } from '@/design-system';
import PackingListScreen from '@/features/trip/PackingListScreen';

/** 打包清单路由（TRP-05）：tripId 必填。 */
export default function TripPackingRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  if (!tripId) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>旅行 id 缺失</Text>
      </View>
    );
  }
  return <PackingListScreen tripId={tripId} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: palette.paperWhite },
  muted: { ...typography.body, color: palette.charcoalSoft },
});
