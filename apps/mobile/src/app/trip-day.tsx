import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { palette, typography } from '@/design-system';
import TripDayPlanScreen from '@/features/trip/TripDayPlanScreen';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 当日造型安排路由（TRP-04）：tripId + date 必填，outfitId 可选（编辑现有安排）。 */
export default function TripDayPlanRoute() {
  const { tripId, date, outfitId } = useLocalSearchParams<{ tripId: string; date: string; outfitId?: string }>();
  if (!tripId || !date || !DATE_RE.test(date)) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>参数无效</Text>
      </View>
    );
  }
  return <TripDayPlanScreen tripId={tripId} date={date} outfitId={outfitId ?? null} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: palette.paperWhite },
  muted: { ...typography.body, color: palette.charcoalSoft },
});
