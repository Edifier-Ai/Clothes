import { useLocalSearchParams } from 'expo-router';

import PlanEditScreen from '@/features/plan/PlanEditScreen';

/** 添加/编辑计划路由（PLN-03）：date 参数新建、id 参数编辑回填。 */
export default function PlanEditRoute() {
  const { date, id } = useLocalSearchParams<{ date?: string; id?: string }>();
  return <PlanEditScreen dateParam={date ?? null} idParam={id ?? null} />;
}
