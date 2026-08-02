import { Redirect, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { palette } from '@/design-system';
import { openAppDb } from '@/core/db/expoDb';
import { loadOnboardState } from '@/core/onboarding';

SplashScreen.preventAutoHideAsync().catch(() => {
  /* preventAutoHideAsync 在原生已隐藏时 reject，忽略 */
});

/**
 * 根布局：全屏 Stack + 深色状态栏（纸白背景）。
 *
 * 首启分流：加载 onboarding completed 状态——
 * - 未完成 → <Redirect href="/onboarding" />（Expo Router 推荐方式，比 initialRouteName 可靠）
 * - 已完成 → 正常渲染 Stack，初始路由 (tabs)
 * 状态加载前保持原生 splash（preventAutoHideAsync），避免闪烁。
 * onboarding 完成后调 router.replace('/') 跳 (tabs)；途中 force-stop 重启恢复节点。
 */
export default function RootLayout() {
  const [completed, setCompleted] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const app = await openAppDb();
        const st = await loadOnboardState(app.db);
        if (!mounted) return;
        setCompleted(st.completed);
      } catch {
        // 读取失败默认进 onboarding（安全：让用户走流程，已录入数据不丢）
        if (mounted) setCompleted(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (completed !== null) {
      SplashScreen.hideAsync().catch(() => {
        /* 已隐藏则忽略 */
      });
    }
  }, [completed]);

  if (completed === null) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack
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
        <Stack.Screen name="look-editor" options={{ headerShown: true, title: '新建造型' }} />
        <Stack.Screen name="look/[id]" options={{ headerShown: true, title: '造型' }} />
        <Stack.Screen name="look-from-garment" options={{ headerShown: true, title: '由此创建造型' }} />
        <Stack.Screen name="plan/[date]" options={{ headerShown: true, title: '计划' }} />
        <Stack.Screen name="plan-edit" options={{ headerShown: true, title: '添加计划' }} />
        <Stack.Screen name="trips" options={{ headerShown: true, title: '旅行' }} />
        <Stack.Screen name="trip-edit" options={{ headerShown: true, title: '旅行' }} />
        <Stack.Screen name="trip/[id]" options={{ headerShown: true, title: '旅行总览' }} />
        <Stack.Screen name="trip-day" options={{ headerShown: true, title: '安排造型' }} />
        <Stack.Screen name="trip-packing/[tripId]" options={{ headerShown: true, title: '打包清单' }} />
        <Stack.Screen name="trip-review/[tripId]" options={{ headerShown: true, title: '旅行复盘' }} />
      </Stack>
      {!completed && <Redirect href="/onboarding" />}
      <StatusBar style="dark" />
    </GestureHandlerRootView>
  );
}
