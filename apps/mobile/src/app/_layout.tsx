import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';

import { palette } from '@/design-system';
import { openAppDb } from '@/core/db/expoDb';
import { loadOnboardState } from '@/core/onboarding';

/**
 * 根布局：全屏 Stack + 深色状态栏（纸白背景）。
 *
 * 首启分流：加载 onboarding completed 状态——未完成则 initialRouteName='onboarding'，
 * 已完成则 '(tabs)'。状态加载前返回 null（native splash 保持），避免闪烁。
 * onboarding 完成后调 router.replace('/') 跳 (tabs)；途中 force-stop 重启会重新进入 onboarding 并恢复节点。
 */
export default function RootLayout() {
  const [initial, setInitial] = useState<'(tabs)' | 'onboarding' | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const app = await openAppDb();
        const st = await loadOnboardState(app.db);
        if (!mounted) return;
        setInitial(st.completed ? '(tabs)' : 'onboarding');
      } catch {
        // 读取失败默认进 onboarding（安全：让用户走流程，已录入数据不丢）
        if (mounted) setInitial('onboarding');
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (!initial) return null;

  return (
    <>
      <Stack
        initialRouteName={initial}
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.paperWhite },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" />
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
