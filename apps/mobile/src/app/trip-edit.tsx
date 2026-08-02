import { useLocalSearchParams } from 'expo-router';

import TripEditScreen from '@/features/trip/TripEditScreen';

/** 新建/编辑旅行路由（TRP-02）：id 参数编辑回填。 */
export default function TripEditRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <TripEditScreen idParam={id ?? null} />;
}
