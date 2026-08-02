import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { palette, typography } from '@/design-system';
import TripReviewScreen from '@/features/trip/TripReviewScreen';

/** 旅行复盘路由（TRP-06）：tripId 必填。 */
export default function TripReviewRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  if (!tripId) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>旅行 id 缺失</Text>
      </View>
    );
  }
  return <TripReviewScreen tripId={tripId} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: palette.paperWhite },
  muted: { ...typography.body, color: palette.charcoalSoft },
});
