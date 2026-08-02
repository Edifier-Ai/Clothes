import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { palette, typography } from '@/design-system';
import TripOverviewScreen from '@/features/trip/TripOverviewScreen';

/** 旅行总览路由（TRP-03）：主体在 features/trip/TripOverviewScreen（可测）。 */
export default function TripOverviewRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>旅行 id 缺失</Text>
      </View>
    );
  }
  return <TripOverviewScreen id={id} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: palette.paperWhite },
  muted: { ...typography.body, color: palette.charcoalSoft },
});
