import { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import type { AppPreferences } from '@/core/preferences';
import { hitTarget, palette, radius, spacing, typography } from '@/design-system';
import {
  EditorialButton,
  HairlineGroup,
  MessagePanel,
  SectionLabel,
  SettingsPage,
} from './SettingsUi';
import {
  defaultPreferenceUiService,
  type PreferenceUiService,
} from './settingsServices';

function PrivacyToggle({
  title,
  description,
  value,
  onValueChange,
  disabled = false,
  accessibilityLabel,
}: {
  title: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  accessibilityLabel: string;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleText}>
        <Text style={styles.toggleTitle}>{title}</Text>
        <Text style={styles.toggleDescription}>{description}</Text>
      </View>
      <Switch
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled, checked: value }}
        disabled={disabled}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: palette.hairline, true: palette.oxblood }}
        thumbColor={palette.white}
      />
    </View>
  );
}

export default function PrivacySettingsScreen({
  preferenceService = defaultPreferenceUiService,
}: {
  preferenceService?: PreferenceUiService;
}) {
  const [saved, setSaved] = useState<AppPreferences | null>(null);
  const [draft, setDraft] = useState<AppPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [showUploadConsent, setShowUploadConsent] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const value = await preferenceService.get();
      setSaved(value);
      setDraft(value);
    } catch {
      setError('隐私选择读取失败。当前不会新增照片上传授权，请重试。');
    } finally {
      setLoading(false);
    }
  }, [preferenceService]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setSavedNotice(false);
    setError(null);
    try {
      const next = await preferenceService.setPhotoUpload(draft.photoUploadEnabled);
      setSaved(next);
      setDraft(next);
      setSavedNotice(true);
    } catch {
      // A write may have partially completed. Reload to show the truthful durable state.
      try {
        const actual = await preferenceService.get();
        setSaved(actual);
        setDraft(actual);
      } catch {
        // Keep the user's draft visible when even the recovery read fails.
      }
      setError('选择没有完整保存。已尽量恢复为设备上的实际状态，请检查后重试。');
    } finally {
      setSaving(false);
    }
  };

  const changed = saved && draft && saved.photoUploadEnabled !== draft.photoUploadEnabled;

  return (
    <SettingsPage
      title="AI 与照片隐私"
      footer={
        <EditorialButton
          label="保存选择"
          onPress={() => void save()}
          disabled={!draft || !changed}
          loading={saving}
        />
      }
    >
      <View style={styles.heroCopy}>
        <Text style={styles.heroTitle}>每一项，<Text style={styles.heroGold}>单独决定</Text></Text>
        <Text style={styles.heroDescription}>关闭网络能力不影响本地衣橱、造型和记录</Text>
      </View>

      <MessagePanel
        tone="gold"
        eyebrow="当前策略"
        title={draft?.photoUploadEnabled ? '已允许单张抠图上传' : '本地优先'}
        description={
          draft?.photoUploadEnabled
            ? '仅在你发起抠图时上传所选单张原图；可随时撤销。'
            : '照片留在设备，抠图在手机本地完成；需要云抠图时会先要求你明确开启。'
        }
      />

      {loading ? (
        <MessagePanel title="正在读取本机选择" description="不会在读取期间发起照片上传或遥测。" />
      ) : null}
      {error ? (
        <MessagePanel
          tone="error"
          title="选择未完成"
          description={error}
          actionLabel="重新读取"
          onAction={() => void load()}
        />
      ) : null}
      {savedNotice ? (
        <MessagePanel tone="success" title="已保存在本机" description="这些选择不会同步到云端。" />
      ) : null}

      <SectionLabel>照片处理</SectionLabel>
      <HairlineGroup>
        <PrivacyToggle
          title="腾讯云抠图上传"
          description="只上传你确认处理的单张原图"
          value={draft?.photoUploadEnabled ?? false}
          disabled={!draft || loading || saving}
          accessibilityLabel="允许腾讯云抠图上传"
          onValueChange={(next) => {
            setSavedNotice(false);
            if (next) setShowUploadConsent(true);
            else setDraft((value) => (value ? { ...value, photoUploadEnabled: false } : value));
          }}
        />
      </HairlineGroup>
      <MessagePanel
        title="上传前说明"
        description="供应商：腾讯云数据万象 GoodsMatting。内容：所选原图。用途：生成前景蒙版。App 会在处理完成后请求删除 COS 暂存对象；云服务处理仍受腾讯云条款约束。原图不会被 AI 改写。"
      />

      <SectionLabel>匿名遥测</SectionLabel>
      <HairlineGroup>
        <PrivacyToggle
          title="使用情况与诊断"
          description="当前版本没有遥测 SDK，不采集也不上传"
          value={false}
          disabled
          accessibilityLabel="匿名遥测当前不可用且关闭"
          onValueChange={() => undefined}
        />
      </HairlineGroup>

      <View style={styles.originalPromise}>
        <Text style={styles.originalPromiseText}>原图永远不会被 AI 改写</Text>
      </View>

      <Modal
        animationType="fade"
        transparent
        visible={showUploadConsent}
        onRequestClose={() => setShowUploadConsent(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalEyebrow}>明确授权</Text>
            <Text style={styles.modalTitle}>允许云抠图上传？</Text>
            <Text style={styles.modalDescription}>
              开启后，只有你在导入或重试抠图时确认的单张原图会上传到腾讯云数据万象。不开启仍可保存原图、稍后处理或手工修边。
            </Text>
            <EditorialButton label="同意并开启" onPress={() => {
              setDraft((value) => (value ? { ...value, photoUploadEnabled: true } : value));
              setShowUploadConsent(false);
            }} />
            <EditorialButton label="保持关闭" tone="secondary" onPress={() => setShowUploadConsent(false)} />
          </View>
        </View>
      </Modal>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  heroCopy: { paddingVertical: spacing.sm },
  heroTitle: { ...typography.display, color: palette.charcoal },
  heroGold: { color: palette.mutedGold },
  heroDescription: { ...typography.body, color: palette.charcoalSoft, marginTop: spacing.xs },
  toggleRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  toggleText: { flex: 1, paddingRight: spacing.md },
  toggleTitle: { ...typography.body, color: palette.charcoal, fontWeight: '600' },
  toggleDescription: { ...typography.bodySm, color: palette.charcoalSoft, marginTop: 2 },
  originalPromise: {
    minHeight: hitTarget.preferred,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.oxblood,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  originalPromiseText: { ...typography.bodySm, color: palette.oxblood },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: 'rgba(38,36,31,0.45)',
  },
  modalCard: {
    backgroundColor: palette.paperWhite,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
  },
  modalEyebrow: { ...typography.caption, color: palette.mutedGold, letterSpacing: 1 },
  modalTitle: { ...typography.title, color: palette.charcoal },
  modalDescription: { ...typography.bodySm, color: palette.charcoalSoft, marginBottom: spacing.xs },
});
