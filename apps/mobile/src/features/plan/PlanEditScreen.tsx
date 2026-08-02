import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { hitTarget, palette, radius, spacing, typography } from '@/design-system';
import type { LookDetail } from '@/core/db/dao';
import { originalUri } from '@/core/files/uri';
import { addDays, todayLocal, weekdayMondayFirst } from '@/core/plan/calendar';
import { getPlan, savePlan } from '@/core/plan/planService';
import { listLooks } from '@/core/looks/lookService';
import { GarmentPicker } from '@/features/looks/GarmentPicker';
import { loadPickCandidates } from '@/features/looks/pickCandidates';
import type { PickCandidate } from '@/features/looks/pickFilter';

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
const TIME_PRESETS = ['白天', '晚餐'];
const OCCASIONS: readonly { key: string; label: string }[] = [
  { key: 'commute', label: '通勤' },
  { key: 'formal', label: '正式' },
  { key: 'casual', label: '休闲' },
  { key: 'dinner', label: '晚餐' },
  { key: 'travel', label: '旅行' },
];

export interface PlanEditScreenProps {
  /** 新建：初始日期（YYYY-MM-DD）。 */
  dateParam?: string | null;
  /** 编辑：计划 id（回填表单）。 */
  idParam?: string | null;
}

/**
 * 添加/编辑计划（PLN-03）：日期步进（含「今天」快捷键）、时间段（预设 + 自定义）、
 * 场合、穿着来源（关联造型单选 / 临时组合多件单品）、备注。
 * 保存失败保留全部表单内容只提示错误（验收锚点）；编辑已有计划时先回填。
 */
export default function PlanEditScreen({ dateParam, idParam }: PlanEditScreenProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(Boolean(idParam));
  const [notFound, setNotFound] = useState(false);
  const [date, setDate] = useState(dateParam ?? todayLocal());
  const [timePreset, setTimePreset] = useState<string | null>(TIME_PRESETS[0]);
  const [timeCustom, setTimeCustom] = useState('');
  const [occasion, setOccasion] = useState<string | null>(null);
  const [mode, setMode] = useState<'look' | 'adhoc'>('look');
  const [lookId, setLookId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [looks, setLooks] = useState<LookDetail[]>([]);
  const [candidates, setCandidates] = useState<PickCandidate[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([listLooks(), loadPickCandidates(), idParam ? getPlan(idParam) : Promise.resolve(null)])
      .then(([l, c, detail]) => {
        if (!mounted) return;
        setLooks(l);
        setCandidates(c);
        if (idParam) {
          if (!detail) {
            setNotFound(true);
            return;
          }
          const p = detail.plan;
          setDate(p.date);
          if (TIME_PRESETS.includes(p.timeLabel)) setTimePreset(p.timeLabel);
          else {
            setTimePreset(null);
            setTimeCustom(p.timeLabel);
          }
          setOccasion(p.occasion);
          if (p.lookId) {
            setMode('look');
            setLookId(p.lookId);
          } else {
            setMode('adhoc');
            setSelectedIds(new Set(detail.outfitGarmentIds));
          }
          setNote(p.note ?? '');
        }
      })
      .catch(() => {
        if (mounted) setError('加载失败，请重试');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [idParam]);

  const candidateName = useMemo(() => new Map(candidates.map((c) => [c.id, c.name])), [candidates]);
  const timeLabel = (timeCustom.trim() || timePreset || '').trim();
  const today = todayLocal();

  const shiftDate = (delta: number) => setDate((d) => addDays(d, delta));

  const toggleAdhoc = (c: PickCandidate) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(c.id)) next.delete(c.id);
      else next.add(c.id);
      return next;
    });
  };

  const save = async () => {
    if (!timeLabel) {
      setError('请填写时间段');
      return;
    }
    if (mode === 'look' && !lookId) {
      setError('请选择造型，或切换到临时组合');
      return;
    }
    if (mode === 'adhoc' && selectedIds.size === 0) {
      setError('临时组合至少选择一件单品');
      return;
    }
    setSaving(true);
    try {
      await savePlan({
        id: idParam ?? undefined,
        date,
        timeLabel,
        occasion,
        lookId: mode === 'look' ? lookId : null,
        garmentIds: mode === 'adhoc' ? [...selectedIds] : [],
        note: note.trim() || null,
      });
      router.back();
    } catch {
      // 验收锚点：保存失败保留表单，仅提示
      setError('保存失败，请重试');
      setSaving(false);
    }
  };

  if (notFound) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>计划不存在或已删除</Text>
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

      <Text style={styles.label}>日期</Text>
      <View style={styles.dateRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="前一天" onPress={() => shiftDate(-1)} style={styles.dateNav}>
          <Text style={styles.dateNavText}>‹</Text>
        </Pressable>
        <Text style={styles.dateText}>
          {Number(date.slice(5, 7))} 月 {Number(date.slice(8, 10))} 日 · 周{WEEKDAYS[weekdayMondayFirst(date)]}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="后一天" onPress={() => shiftDate(1)} style={styles.dateNav}>
          <Text style={styles.dateNavText}>›</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="设为今天"
          onPress={() => setDate(today)}
          style={[styles.chip, date === today && styles.chipActive]}
        >
          <Text style={[styles.chipText, date === today && styles.chipTextActive]}>今天</Text>
        </Pressable>
      </View>

      <Text style={styles.label}>时间段</Text>
      <View style={styles.chipRow}>
        {TIME_PRESETS.map((t) => (
          <Pressable
            key={t}
            accessibilityRole="button"
            accessibilityState={{ selected: timePreset === t && !timeCustom.trim() }}
            onPress={() => {
              setTimePreset(t);
              setTimeCustom('');
            }}
            style={[styles.chip, timePreset === t && !timeCustom.trim() && styles.chipActive]}
          >
            <Text style={[styles.chipText, timePreset === t && !timeCustom.trim() && styles.chipTextActive]}>{t}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        value={timeCustom}
        onChangeText={setTimeCustom}
        placeholder="自定义时间段（如 下午茶）"
        placeholderTextColor={palette.charcoalSoft}
        style={styles.input}
        accessibilityLabel="自定义时间段"
      />

      <Text style={styles.label}>场合（可选）</Text>
      <View style={styles.chipRow}>
        {OCCASIONS.map((o) => (
          <Pressable
            key={o.key}
            accessibilityRole="button"
            accessibilityState={{ selected: occasion === o.key }}
            onPress={() => setOccasion((cur) => (cur === o.key ? null : o.key))}
            style={[styles.chip, occasion === o.key && styles.chipActive]}
          >
            <Text style={[styles.chipText, occasion === o.key && styles.chipTextActive]}>{o.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>穿着</Text>
      <View style={styles.chipRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: mode === 'look' }}
          onPress={() => setMode('look')}
          style={[styles.chip, mode === 'look' && styles.chipActive]}
        >
          <Text style={[styles.chipText, mode === 'look' && styles.chipTextActive]}>选择造型</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: mode === 'adhoc' }}
          onPress={() => setMode('adhoc')}
          style={[styles.chip, mode === 'adhoc' && styles.chipActive]}
        >
          <Text style={[styles.chipText, mode === 'adhoc' && styles.chipTextActive]}>临时组合</Text>
        </Pressable>
      </View>

      {mode === 'look' ? (
        looks.length === 0 ? (
          <Text style={styles.muted}>还没有造型，可先在造型页创建，或用临时组合。</Text>
        ) : (
          <View style={styles.lookList}>
            {looks.map((l) => (
              <Pressable
                key={l.look.id}
                accessibilityRole="button"
                accessibilityState={{ selected: lookId === l.look.id }}
                onPress={() => setLookId(l.look.id)}
                style={[styles.lookRow, lookId === l.look.id && styles.lookRowActive]}
              >
                {l.look.coverRelPath ? (
                  <Image source={{ uri: originalUri(l.look.coverRelPath) }} style={styles.lookCover} contentFit="cover" />
                ) : (
                  <View style={[styles.lookCover, styles.lookCoverBlank]} />
                )}
                <Text style={styles.lookName} numberOfLines={1}>
                  {l.look.name}
                </Text>
                {lookId === l.look.id ? <Text style={styles.pickedMark}>✓</Text> : null}
              </Pressable>
            ))}
          </View>
        )
      ) : (
        <View>
          <Pressable accessibilityRole="button" onPress={() => setPickerOpen(true)} style={styles.ghostBtn}>
            <Text style={styles.ghostBtnLabel}>选择单品（已选 {selectedIds.size}）</Text>
          </Pressable>
          {selectedIds.size > 0 ? (
            <View style={styles.chipRow}>
              {[...selectedIds].map((gid) => (
                <Pressable
                  key={gid}
                  accessibilityRole="button"
                  accessibilityLabel={`移除 ${candidateName.get(gid) ?? '单品'}`}
                  onPress={() =>
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      next.delete(gid);
                      return next;
                    })
                  }
                  style={styles.chip}
                >
                  <Text style={styles.chipText}>{candidateName.get(gid) ?? '未知单品'} ✕</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      )}

      <Text style={styles.label}>备注（可选）</Text>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="如：见客户，带伞"
        placeholderTextColor={palette.charcoalSoft}
        style={[styles.input, styles.noteInput]}
        multiline
        accessibilityLabel="备注"
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="保存计划"
        disabled={saving}
        onPress={() => void save()}
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
      >
        <Text style={styles.saveBtnLabel}>{saving ? '保存中…' : '保存'}</Text>
      </Pressable>

      {pickerOpen ? (
        <GarmentPicker
          candidates={candidates}
          slot={null}
          selectedIds={selectedIds}
          onPick={toggleAdhoc}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
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
  input: {
    ...typography.body,
    color: palette.charcoal,
    backgroundColor: palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    minHeight: hitTarget.preferred,
    marginTop: spacing.xs,
  },
  noteInput: { minHeight: hitTarget.preferred * 2, textAlignVertical: 'top', paddingTop: spacing.xs },
  lookList: { marginTop: spacing.xs },
  lookRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: hitTarget.preferred,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  lookRowActive: { backgroundColor: palette.sandSoft },
  lookCover: { width: 40, height: 54, borderRadius: radius.sm, backgroundColor: palette.sandSoft },
  lookCoverBlank: { borderWidth: StyleSheet.hairlineWidth, borderColor: palette.hairline },
  lookName: { ...typography.body, color: palette.charcoal, flex: 1 },
  pickedMark: { ...typography.body, color: palette.oxblood },
  ghostBtn: {
    minHeight: hitTarget.preferred,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.oxblood,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  ghostBtnLabel: { ...typography.bodySm, color: palette.oxblood },
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
