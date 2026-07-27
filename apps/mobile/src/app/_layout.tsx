import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { palette } from '@/design-system';

/**
 * 根布局：全屏 Stack + 深色状态栏（纸白背景）。
 * 具体页面在 (tabs) 分组内；后续模态流程（导入、修边）挂在同级 Stack。
 */
export default function RootLayout() {
  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.paperWhite },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="add-garment" options={{ presentation: 'modal', headerShown: true, title: '' }} />
        <Stack.Screen name="batch-import" options={{ headerShown: true, title: '批量导入' }} />
        <Stack.Screen name="cutout-editor" options={{ headerShown: true, title: '修边' }} />
        <Stack.Screen name="garment/[id]" options={{ headerShown: true, title: '衣物' }} />
        <Stack.Screen name="segmentation-benchmark" options={{ headerShown: true, title: '抠图探针' }} />
      </Stack>
      <StatusBar style="dark" />
    </>
  );
}
