import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import type { RecommendationFactors } from '@/core/recommend';
import { palette, spacing, typography } from '@/design-system';
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

const FACTORS: readonly {
  key: keyof RecommendationFactors;
  title: string;
  description: string;
}[] = [
  { key: 'occasion', title: '场合', description: '让通勤、正式、旅行等场景影响组合与理由' },
  { key: 'colorHarmony', title: '颜色协调', description: '优先避开明显冲突的上下装配色' },
  { key: 'wardrobeActivation', title: '久未穿优先', description: '优先盘活久未穿和新录入的衣物' },
  { key: 'repeatAvoidance', title: '避免近期重复', description: '降低最近穿过单品与刚跳过组合的优先级' },
  { key: 'feedbackLearning', title: '反馈偏好', description: '参考你接受、替换和跳过的历史选择' },
  { key: 'heroItem', title: '主角单品', description: '允许换一套时锁定一件主角衣物' },
  { key: 'weather', title: '天气与季节', description: '按今天选的气温搭配：衣物的季节标签要对得上，冷凉天加外套、热天不加' },
];

function FactorRow({
  factor,
  value,
  disabled,
  onChange,
}: {
  factor: (typeof FACTORS)[number];
  value: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.factorRow}>
      <View style={styles.factorText}>
        <Text style={styles.factorTitle}>{factor.title}</Text>
        <Text style={styles.factorDescription}>{factor.description}</Text>
      </View>
      <Switch
        accessibilityLabel={`参考${factor.title}`}
        accessibilityState={{ checked: value, disabled }}
        disabled={disabled}
        value={value}
        onValueChange={onChange}
        trackColor={{ false: palette.hairline, true: palette.oxblood }}
        thumbColor={palette.white}
      />
    </View>
  );
}

export default function RecommendationSettingsScreen({
  preferenceService = defaultPreferenceUiService,
}: {
  preferenceService?: PreferenceUiService;
}) {
  const [saved, setSaved] = useState<RecommendationFactors | null>(null);
  const [draft, setDraft] = useState<RecommendationFactors | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setNotice(null);
    try {
      const value = (await preferenceService.get()).recommendationFactors;
      setSaved(value);
      setDraft(value);
    } catch {
      setNotice('推荐设置读取失败，衣橱数据没有改变。');
    }
  }, [preferenceService]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const changed = saved && draft && FACTORS.some(({ key }) => saved[key] !== draft[key]);
  const enabledCount = draft ? Object.values(draft).filter(Boolean).length : 0;

  const save = async () => {
    if (!draft || saving) return;
    setSaving(true);
    setNotice(null);
    try {
      const next = await preferenceService.setRecommendationFactors(draft);
      setSaved(next.recommendationFactors);
      setDraft(next.recommendationFactors);
      setNotice('已保存；回到今日页后，下一次生成会使用这些要素。');
    } catch {
      setNotice('设置没有保存，请重试。当前推荐仍使用上一次已保存选择。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsPage
      title="推荐参考要素"
      footer={
        <EditorialButton
          label="保存推荐设置"
          onPress={() => void save()}
          disabled={!draft || !changed}
          loading={saving}
        />
      }
    >
      <View style={styles.hero}>
        <Text style={styles.heroNumber}>{draft ? enabledCount : '—'}</Text>
        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle}>项要素已启用</Text>
          <Text style={styles.heroDescription}>库存可用性与合法槽位始终生效，无法关闭</Text>
        </View>
      </View>

      {notice ? <MessagePanel title="本机设置" description={notice} tone="gold" /> : null}

      <SectionLabel>搭配依据</SectionLabel>
      <HairlineGroup>
        {FACTORS.map((factor) => (
          <FactorRow
            key={factor.key}
            factor={factor}
            value={draft?.[factor.key] ?? false}
            disabled={!draft || saving}
            onChange={(value) => {
              setNotice(null);
              setDraft((current) => current ? { ...current, [factor.key]: value } : current);
            }}
          />
        ))}
      </HairlineGroup>

      <MessagePanel
        tone="gold"
        eyebrow="始终保留"
        title="安全硬约束"
        description="待洗、干洗、借出和已归档衣物不会进入候选；连衣裙与上下装槽位关系也不会因设置改变。"
      />
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md },
  heroNumber: { ...typography.display, color: palette.mutedGold, minWidth: 54 },
  heroCopy: { flex: 1, paddingLeft: spacing.sm },
  heroTitle: { ...typography.title, color: palette.charcoal },
  heroDescription: { ...typography.bodySm, color: palette.charcoalSoft, marginTop: spacing.xxs },
  factorRow: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  factorText: { flex: 1, paddingRight: spacing.md },
  factorTitle: { ...typography.body, color: palette.charcoal, fontWeight: '600' },
  factorDescription: { ...typography.bodySm, color: palette.charcoalSoft, marginTop: spacing.xxs },
});
