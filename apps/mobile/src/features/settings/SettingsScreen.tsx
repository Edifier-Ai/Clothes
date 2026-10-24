import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { AppPreferences } from '@/core/preferences';
import { palette, spacing, typography } from '@/design-system';
import {
  HairlineGroup,
  MessagePanel,
  SectionLabel,
  SettingsPage,
  SettingsRow,
} from './SettingsUi';
import {
  defaultPreferenceUiService,
  type PreferenceUiService,
} from './settingsServices';

export default function SettingsScreen({
  preferenceService = defaultPreferenceUiService,
}: {
  preferenceService?: PreferenceUiService;
}) {
  const router = useRouter();
  const [preferences, setPreferences] = useState<AppPreferences | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPreferences(await preferenceService.get());
    } catch {
      setError('本地设置读取失败。衣橱数据没有改变，可重试读取。');
    }
  }, [preferenceService]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  return (
    <SettingsPage title="设置">
      <View style={styles.localHero}>
        <Text style={styles.localMark}>LOCAL</Text>
        <View style={styles.localText}>
          <Text style={styles.localTitle}>本地模式</Text>
          <Text style={styles.localDescription}>无需账号，核心衣橱始终可离线使用</Text>
        </View>
      </View>

      {error ? (
        <MessagePanel
          tone="error"
          title="设置暂未读取"
          description={error}
          actionLabel="重试读取"
          onAction={() => void load()}
        />
      ) : null}

      <SectionLabel>网络与智能</SectionLabel>
      <HairlineGroup>
        <SettingsRow
          icon="options-outline"
          title="推荐参考要素"
          description="自由选择场合、配色、盘活与学习偏好"
          value={
            preferences
              ? `${Object.values(preferences.recommendationFactors).filter(Boolean).length}/6`
              : '读取中'
          }
          onPress={() => router.push('/settings/recommendations')}
        />
        <SettingsRow
          icon="lock-closed-outline"
          title="AI 与照片隐私"
          description="照片上传、供应商与保留说明"
          value={
            preferences
              ? preferences.photoUploadEnabled
                ? '已明确允许'
                : '本地优先'
              : '读取中'
          }
          onPress={() => router.push('/settings/privacy')}
        />
      </HairlineGroup>

      <SectionLabel>演示体验</SectionLabel>
      <HairlineGroup>
        <SettingsRow
          icon="sparkles-outline"
          title="演示数据"
          description="一键准备衣橱、计划、洞察与购物案例"
          value="可重复载入"
          onPress={() => router.push('/settings/demo')}
        />
      </HairlineGroup>

      <SectionLabel>版本与权益</SectionLabel>
      <HairlineGroup>
        <SettingsRow
          icon="information-circle-outline"
          title="当前版本"
          description="本地优先智能衣橱"
          value="0.1.0"
        />
      </HairlineGroup>

      <View style={styles.promise}>
        <View style={styles.promiseLine} />
        <Text style={styles.promiseText}>无账号也能使用核心功能 · 核心数据保存在本机</Text>
        <View style={styles.promiseLine} />
      </View>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  localHero: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  localMark: {
    ...typography.caption,
    width: 72,
    height: 72,
    lineHeight: 72,
    textAlign: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    borderRadius: 36,
    color: palette.mutedGold,
    letterSpacing: 1.2,
  },
  localText: { flex: 1, paddingLeft: spacing.md },
  localTitle: { ...typography.title, color: palette.charcoal },
  localDescription: { ...typography.bodySm, color: palette.charcoalSoft, marginTop: spacing.xxs },
  promise: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  promiseLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: palette.mutedGold },
  promiseText: { ...typography.caption, color: palette.charcoalSoft, textAlign: 'center' },
});
