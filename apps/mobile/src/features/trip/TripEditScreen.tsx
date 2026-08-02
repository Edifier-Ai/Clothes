import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { hitTarget, palette, radius, spacing, typography } from '@/design-system';
import { addDays, todayLocal } from '@/core/plan/calendar';
import { getTrip, saveTrip } from '@/core/trip/tripService';

const TIMEZONES: readonly { key: string; label: string }[] = [
  { key: 'Asia/Shanghai', label: '上海' },
  { key: 'Asia/Tokyo', label: '东京' },
  { key: 'Asia/Bangkok', label: '曼谷' },
  { key: 'Asia/Singapore', label: '新加坡' },
  { key: 'Europe/London', label: '伦敦' },
  { key: 'America/New_York', label: '纽约' },
  { key: 'America/Los_Angeles', label: '洛杉矶' },
  { key: 'UTC', label: 'UTC' },
];

export interface TripEditScreenProps {
  /** 新建：null；编辑：旅行 id。 */
  idParam?: string | null;
}

/**
 * 新建/编辑旅行（TRP-02）：名称、目的地、当地日期范围（YYYY-MM-DD）、
 * 时区（IANA）、活动（每行 date+timeLabel+note）。天气快照可选且本卡不强制抓取
 * （任务卡「天气不可用不阻塞旅行」），UI 留空显示「无天气」。
 * 保存失败保留表单只提示错误（与 PlanEditScreen 一致）。
 */
export default function TripEditScreen({ idParam }: TripEditScreenProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(Boolean(idParam));
  const [notFound, setNotFound] = useState(false);
  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState(todayLocal());
  const [endDate, setEndDate] = useState(addDays(todayLocal(), 3));
  const [timeZone, setTimeZone] = useState('Asia/Shanghai');
  const [activities, setActivities] = useState<{ date: string; timeLabel: string; note: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!idParam) {
      // loading 初值 = Boolean(idParam) 已为 false，无需同步 setState（react-hooks/set-state-in-effect）
      return;
    }
    let mounted = true;
    getTrip(idParam)
      .then((detail) => {
        if (!mounted) return;
        if (!detail) {
          setNotFound(true);
          return;
        }
        const t = detail.trip;
        setName(t.name);
        setDestination(t.destination);
        setStartDate(t.startDate);
        setEndDate(t.endDate);
        setTimeZone(t.timeZone);
        setActivities(
          detail.activities.map((a) => ({
            date: a.date,
            timeLabel: a.timeLabel,
            note: a.note ?? '',
          })),
        );
      })
      .catch(() => setError('加载失败，请重试'))
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [idParam]);

  const shiftStart = (delta: number) => setStartDate((d) => addDays(d, delta));
  const shiftEnd = (delta: number) => setEndDate((d) => addDays(d, delta));

  const addActivity = () =>
    setActivities((prev) => [...prev, { date: startDate, timeLabel: '白天', note: '' }]);
  const updateActivity = (i: number, patch: Partial<{ date: string; timeLabel: string; note: string }>) =>
    setActivities((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  const removeActivity = (i: number) =>
    setActivities((prev) => prev.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!name.trim()) {
      setError('请填写旅行名称');
      return;
    }
    if (!destination.trim()) {
      setError('请填写目的地');
      return;
    }
    if (endDate < startDate) {
      setError('结束日期不能早于开始日期');
      return;
    }
    setSaving(true);
    try {
      await saveTrip({
        id: idParam ?? undefined,
        name: name.trim(),
        destination: destination.trim(),
        startDate,
        endDate,
        timeZone,
        activities: activities
          .filter((a) => a.timeLabel.trim())
          .map((a) => ({
            date: a.date,
            timeLabel: a.timeLabel.trim(),
            note: a.note.trim() || null,
          })),
        weatherSnapshot: null,
      });
      router.back();
    } catch {
      setError('保存失败，请重试');
      setSaving(false);
    }
  };

  if (notFound) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>旅行不存在或已删除</Text>
      </View>
    );
  }
  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>加载中…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Text style={styles.label}>名称</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="如：东京行"
        placeholderTextColor={palette.charcoalSoft}
        style={styles.input}
        accessibilityLabel="旅行名称"
      />

      <Text style={styles.label}>目的地</Text>
      <TextInput
        value={destination}
        onChangeText={setDestination}
        placeholder="如：东京"
        placeholderTextColor={palette.charcoalSoft}
        style={styles.input}
        accessibilityLabel="目的地"
      />

      <Text style={styles.label}>开始日期（当地）</Text>
      <View style={styles.dateRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="开始日期前一天" onPress={() => shiftStart(-1)} style={styles.dateNav}>
          <Text style={styles.dateNavText}>‹</Text>
        </Pressable>
        <Text style={styles.dateText}>{startDate}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="开始日期后一天" onPress={() => shiftStart(1)} style={styles.dateNav}>
          <Text style={styles.dateNavText}>›</Text>
        </Pressable>
      </View>

      <Text style={styles.label}>结束日期（当地）</Text>
      <View style={styles.dateRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="结束日期前一天" onPress={() => shiftEnd(-1)} style={styles.dateNav}>
          <Text style={styles.dateNavText}>‹</Text>
        </Pressable>
        <Text style={styles.dateText}>{endDate}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="结束日期后一天" onPress={() => shiftEnd(1)} style={styles.dateNav}>
          <Text style={styles.dateNavText}>›</Text>
        </Pressable>
      </View>

      <Text style={styles.label}>时区</Text>
      <View style={styles.chipRow}>
        {TIMEZONES.map((tz) => (
          <Pressable
            key={tz.key}
            accessibilityRole="button"
            accessibilityState={{ selected: timeZone === tz.key }}
            onPress={() => setTimeZone(tz.key)}
            style={[styles.chip, timeZone === tz.key && styles.chipActive]}
          >
            <Text style={[styles.chipText, timeZone === tz.key && styles.chipTextActive]}>{tz.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.actHeader}>
        <Text style={styles.label}>活动安排</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="添加活动" onPress={addActivity} style={styles.actAddBtn}>
          <Text style={styles.actAddLabel}>+ 添加</Text>
        </Pressable>
      </View>
      {activities.length === 0 ? (
        <Text style={styles.muted}>尚未添加活动。可在旅行总览页用「安排造型」补全。</Text>
      ) : (
        activities.map((a, i) => (
          <View key={i} style={styles.actCard}>
            <View style={styles.actRow}>
              <TextInput
                value={a.date}
                onChangeText={(v) => updateActivity(i, { date: v })}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={palette.charcoalSoft}
                style={[styles.input, styles.actDateInput]}
                accessibilityLabel={`活动 ${i + 1} 日期`}
              />
              <TextInput
                value={a.timeLabel}
                onChangeText={(v) => updateActivity(i, { timeLabel: v })}
                placeholder="白天"
                placeholderTextColor={palette.charcoalSoft}
                style={[styles.input, styles.actTimeInput]}
                accessibilityLabel={`活动 ${i + 1} 时间段`}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`删除活动 ${i + 1}`}
                onPress={() => removeActivity(i)}
                style={styles.actRemoveBtn}
              >
                <Text style={styles.dangerLabel}>✕</Text>
              </Pressable>
            </View>
            <TextInput
              value={a.note}
              onChangeText={(v) => updateActivity(i, { note: v })}
              placeholder="备注（可选）"
              placeholderTextColor={palette.charcoalSoft}
              style={[styles.input, styles.actNoteInput]}
              accessibilityLabel={`活动 ${i + 1} 备注`}
            />
          </View>
        ))
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="保存旅行"
        disabled={saving}
        onPress={() => void save()}
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
      >
        <Text style={styles.saveBtnLabel}>{saving ? '保存中…' : '保存'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.paperWhite },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: palette.paperWhite },
  muted: { ...typography.body, color: palette.charcoalSoft },
  errorText: { ...typography.bodySm, color: palette.danger, marginBottom: spacing.sm },
  label: { ...typography.bodySm, color: palette.charcoalSoft, marginTop: spacing.md, marginBottom: spacing.xs },
  input: {
    ...typography.body,
    color: palette.charcoal,
    backgroundColor: palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    minHeight: hitTarget.preferred,
  },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dateNav: { minWidth: hitTarget.min, minHeight: hitTarget.min, alignItems: 'center', justifyContent: 'center' },
  dateNavText: { ...typography.title, color: palette.charcoal },
  dateText: { ...typography.body, color: palette.charcoal, flex: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    minHeight: hitTarget.min,
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: palette.oxblood, borderColor: palette.oxblood },
  chipText: { ...typography.bodySm, color: palette.charcoal },
  chipTextActive: { color: palette.white },
  actHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actAddBtn: { minHeight: hitTarget.min, justifyContent: 'center', paddingHorizontal: spacing.sm },
  actAddLabel: { ...typography.bodySm, color: palette.oxblood },
  actCard: {
    marginTop: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: palette.sandSoft,
  },
  actRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  actDateInput: { flex: 1 },
  actTimeInput: { flex: 1 },
  actRemoveBtn: { minWidth: hitTarget.min, minHeight: hitTarget.min, alignItems: 'center', justifyContent: 'center' },
  dangerLabel: { ...typography.bodySm, color: palette.danger },
  actNoteInput: { marginTop: spacing.xs, minHeight: hitTarget.preferred },
  saveBtn: {
    minHeight: hitTarget.preferred,
    marginTop: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: palette.oxblood,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnLabel: { ...typography.body, color: palette.white },
});
