import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { palette, typography } from '@/design-system';
import PlanDayScreen from '@/features/plan/PlanDayScreen';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 日期详情路由（PLN-02）：主体在 features/plan/PlanDayScreen（可测）。 */
export default function PlanDayRoute() {
  const { date } = useLocalSearchParams<{ date: string }>();
  if (!date || !DATE_RE.test(date)) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>日期无效</Text>
      </View>
    );
  }
  return <PlanDayScreen date={date} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: palette.paperWhite },
  muted: { ...typography.body, color: palette.charcoalSoft },
});
