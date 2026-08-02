import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { hitTarget, palette, radius, spacing, typography } from '@/design-system';
import type { LookDetail, TripOutfitDetail } from '@/core/db/dao';
import { originalUri } from '@/core/files/uri';
import { weekdayMondayFirst } from '@/core/plan/calendar';
import { listActiveGarmentsWithThumbs } from '@/core/garments/service';
import { listLooks } from '@/core/looks/lookService';
import { GarmentPicker } from '@/features/looks/GarmentPicker';
import { loadPickCandidates } from '@/features/looks/pickCandidates';
import type { PickCandidate } from '@/features/looks/pickFilter';
import {
  deleteTripOutfit,
  listTripOutfits,
  recordTripOutfitWorn,
  saveTripOutfit,
} from '@/core/trip/tripService';

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
const TIME_PRESETS = ['白天', '晚餐'];
const OCCASIONS: readonly { key: string; label: string }[] = [
  { key: 'commute', label: '通勤' },
  { key: 'formal', label: '正式' },
  { key: 'casual', label: '休闲' },
  { key: 'dinner', label: '晚餐' },
  { key: 'travel', label: '旅行' },
];

export interface TripDayPlanScreenProps {
  tripId: string;
  date: string;
  /** 编辑现有安排；缺省 = 新建。 */
  outfitId?: string | null;
}

/**
 * 当日造型安排（TRP-04）：列出当日全部安排（同日多时段独立），主操作「添加安排」
 * （时间段预设/自定义 + 关联造型或临时组合，与 PlanEditScreen 一致），可记录已穿/有变化、删除（墓碑）。
 * 关联造型被删时显示缺失与「重新选择造型」修复入口。
 */
export default function TripDayPlanScreen({ tripId, date, outfitId }: TripDayPlanScreenProps) {
  const [outfits, setOutfits] = useState<TripOutfitDetail[]>([]);
  const [looks, setLooks] = useState<LookDetail[]>([]);
  const [thumbs, setThumbs] = useState<Map<string, string | null>>(new Map());
  const [candidates, setCandidates] = useState<PickCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 新建/编辑表单
  const [editing, setEditing] = useState<string | null>(outfitId ?? 'new'); // 'new' | outfitId | null
  const [timePreset, setTimePreset] = useState<string | null>(TIME_PRESETS[0]);
  const [timeCustom, setTimeCustom] = useState('');
  const [occasion, setOccasion] = useState<string | null>(null);
  const [mode, setMode] = useState<'look' | 'adhoc'>('look');
  const [lookId, setLookId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [changeFor, setChangeFor] = useState<string | null>(null);
  const [changeText, setChangeText] = useState('');

  const load = useCallback(() => {
    Promise.all([listTripOutfits(tripId), listLooks(), listActiveGarmentsWithThumbs(), loadPickCandidates()])
      .then(([o, l, g, c]) => {
        setOutfits(o.filter((x) => x.tripOutfit.date === date));
        setLooks(l);
        setThumbs(new Map(g.map((row) => [row.garment.id, row.imageRelPath])));
        setCandidates(c);
        setError(null);
      })
      .catch(() => setError('安排加载失败，请重试'));
  }, [tripId, date]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // 进入编辑模式时回填；setState 走微任务包裹以符合 react-hooks/set-state-in-effect
  // （与 PlanEditScreen 的 Promise.then 模式一致：表单回填/重置不在 effect body 同步执行）
  useEffect(() => {
    if (!editing) return;
    let mounted = true;
    Promise.resolve().then(() => {
      if (!mounted) return;
      // 重置 saving：上次成功保存后 setEditing(null) 不重置 saving（editor 卸载），
      // 重开 editor 时 saving 可能仍为 true 导致按钮禁用 + 文案卡在「保存中…」
      setSaving(false);
      if (editing === 'new') {
        setTimePreset(TIME_PRESETS[0]);
        setTimeCustom('');
        setOccasion(null);
        setMode('look');
        setLookId(null);
        setSelectedIds(new Set());
        setNote('');
        return;
      }
      const target = outfits.find((o) => o.tripOutfit.id === editing);
      if (!target) return;
      const t = target.tripOutfit;
      if (TIME_PRESETS.includes(t.timeLabel)) {
        setTimePreset(t.timeLabel);
        setTimeCustom('');
      } else {
        setTimePreset(null);
        setTimeCustom(t.timeLabel);
      }
      setOccasion(t.occasion);
      if (t.lookId) {
        setMode('look');
        setLookId(t.lookId);
      } else {
        setMode('adhoc');
        setSelectedIds(new Set(target.outfitGarmentIds));
      }
      setNote(t.note ?? '');
    });
    return () => {
      mounted = false;
    };
  }, [editing, outfits]);

  const candidateName = useMemo(() => new Map(candidates.map((c) => [c.id, c.name])), [candidates]);
  const timeLabel = (timeCustom.trim() || timePreset || '').trim();
  const dayOutfits = outfits;

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
      await saveTripOutfit({
        id: editing === 'new' ? undefined : editing ?? undefined,
        tripId,
        date,
        timeLabel,
        occasion,
        lookId: mode === 'look' ? lookId : null,
        garmentIds: mode === 'adhoc' ? [...selectedIds] : [],
        note: note.trim() || null,
      });
      setEditing(null);
      load();
    } catch {
      setError('保存失败，请重试');
      setSaving(false);
    }
  };

  const mark = async (o: TripOutfitDetail, asPlanned: boolean, changeNote?: string) => {
    try {
      await recordTripOutfitWorn(o.tripOutfit.id, { asPlanned, changeNote });
      setChangeFor(null);
      setChangeText('');
      load();
    } catch {
      setError('记录失败，请重试');
    }
  };

  const remove = async (o: TripOutfitDetail) => {
    try {
      await deleteTripOutfit(o.tripOutfit.id);
      load();
    } catch {
      setError('删除失败，请重试');
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>
        {Number(date.slice(5, 7))} 月 {Number(date.slice(8, 10))} 日 · 周{WEEKDAYS[weekdayMondayFirst(date)]}
      </Text>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {dayOutfits.length === 0 && !editing ? <Text style={styles.muted}>这一天还没有安排</Text> : null}

      {dayOutfits.map((o) => {
        const look = o.tripOutfit.lookId ? looks.find((l) => l.look.id === o.tripOutfit.lookId) : undefined;
        return (
          <View key={o.tripOutfit.id} style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>
                {o.tripOutfit.timeLabel}
                {o.tripOutfit.occasion ? ` · ${OCCASIONS.find((x) => x.key === o.tripOutfit.occasion)?.label ?? o.tripOutfit.occasion}` : ''}
              </Text>
              {o.tripOutfit.wornStatus !== 'planned' ? (
                <Text style={styles.wornBadge}>{o.tripOutfit.wornStatus === 'completed' ? '已穿' : '有变化'}</Text>
              ) : null}
            </View>
            {look ? <Text style={styles.lookName}>造型：{look.look.name}</Text> : null}
            {o.lookMissing ? (
              <View style={styles.missingRow}>
                <Text style={styles.missingText}>关联造型已删除，快照保留</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="修复安排"
                  onPress={() => setEditing(o.tripOutfit.id)}
                  style={styles.repairBtn}
                >
                  <Text style={styles.repairLabel}>重新选择造型</Text>
                </Pressable>
              </View>
            ) : null}
            <View style={styles.thumbRow}>
              {o.outfitGarmentIds.map((gid) => {
                const rel = thumbs.get(gid);
                return rel ? (
                  <Image key={gid} source={{ uri: originalUri(rel) }} style={styles.thumb} contentFit="cover" />
                ) : (
                  <View key={gid} style={[styles.thumb, styles.thumbBlank]} />
                );
              })}
            </View>
            {o.tripOutfit.note ? <Text style={styles.note}>备注：{o.tripOutfit.note}</Text> : null}
            {o.tripOutfit.wornStatus === 'changed' && o.tripOutfit.wornChangeNote ? (
              <Text style={styles.note}>变化：{o.tripOutfit.wornChangeNote}</Text>
            ) : null}

            {o.tripOutfit.wornStatus === 'planned' ? (
              <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`记录已穿 ${o.tripOutfit.timeLabel}`}
                  onPress={() => void mark(o, true)}
                  style={styles.primaryBtn}
                >
                  <Text style={styles.primaryBtnLabel}>记录已穿</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`计划有变化 ${o.tripOutfit.timeLabel}`}
                  onPress={() => {
                    setChangeFor(changeFor === o.tripOutfit.id ? null : o.tripOutfit.id);
                    setChangeText('');
                  }}
                  style={styles.ghostBtn}
                >
                  <Text style={styles.ghostBtnLabel}>有变化</Text>
                </Pressable>
              </View>
            ) : null}
            {changeFor === o.tripOutfit.id ? (
              <View style={styles.changeBox}>
                <TextInput
                  value={changeText}
                  onChangeText={setChangeText}
                  placeholder="实际穿了什么变化？"
                  placeholderTextColor={palette.charcoalSoft}
                  style={styles.changeInput}
                  testID={`change-note-${o.tripOutfit.id}`}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="确认记录变化"
                  onPress={() => void mark(o, false, changeText.trim() || undefined)}
                  style={styles.primaryBtn}
                >
                  <Text style={styles.primaryBtnLabel}>记录</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.footerRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`编辑安排 ${o.tripOutfit.timeLabel}`}
                onPress={() => setEditing(o.tripOutfit.id)}
                style={styles.footerBtn}
              >
                <Text style={styles.footerBtnLabel}>编辑</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`删除安排 ${o.tripOutfit.timeLabel}`}
                onPress={() => void remove(o)}
                style={styles.footerBtn}
              >
                <Text style={[styles.footerBtnLabel, styles.dangerLabel]}>删除</Text>
              </Pressable>
            </View>
          </View>
        );
      })}

      {editing ? (
        <View style={styles.editorCard}>
          <Text style={styles.editorTitle}>{editing === 'new' ? '添加安排' : '编辑安排'}</Text>
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
            placeholder="自定义时间段"
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
            placeholder="如：见客户"
            placeholderTextColor={palette.charcoalSoft}
            style={[styles.input, styles.noteInput]}
            multiline
            accessibilityLabel="备注"
          />

          <View style={styles.editorActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="取消编辑"
              onPress={() => setEditing(null)}
              style={styles.footerBtn}
            >
              <Text style={styles.footerBtnLabel}>取消</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="保存安排"
              disabled={saving}
              onPress={() => void save()}
              style={[styles.primaryBtn, saving && styles.saveBtnDisabled]}
            >
              <Text style={styles.primaryBtnLabel}>{saving ? '保存中…' : '保存'}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="添加安排"
          onPress={() => setEditing('new')}
          style={styles.addBtn}
        >
          <Text style={styles.addBtnLabel}>添加安排</Text>
        </Pressable>
      )}

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
  title: { ...typography.headline, color: palette.charcoal },
  muted: { ...typography.body, color: palette.charcoalSoft, marginTop: spacing.md },
  errorText: { ...typography.bodySm, color: palette.danger, marginTop: spacing.sm },
  card: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: palette.sandSoft,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { ...typography.headline, color: palette.charcoal },
  wornBadge: { ...typography.caption, color: palette.oxblood },
  lookName: { ...typography.bodySm, color: palette.charcoalSoft, marginTop: spacing.xxs },
  missingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs },
  missingText: { ...typography.caption, color: palette.danger, flex: 1 },
  repairBtn: { minHeight: hitTarget.min, justifyContent: 'center', paddingHorizontal: spacing.sm },
  repairLabel: { ...typography.bodySm, color: palette.oxblood },
  thumbRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm },
  thumb: { width: 48, height: 64, borderRadius: radius.sm, backgroundColor: palette.paperWhite },
  thumbBlank: { borderWidth: StyleSheet.hairlineWidth, borderColor: palette.hairline },
  note: { ...typography.bodySm, color: palette.charcoalSoft, marginTop: spacing.xs },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  primaryBtn: {
    minHeight: hitTarget.preferred,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: palette.oxblood,
    justifyContent: 'center',
  },
  primaryBtnLabel: { ...typography.bodySm, color: palette.white },
  ghostBtn: {
    minHeight: hitTarget.preferred,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.oxblood,
    justifyContent: 'center',
  },
  ghostBtnLabel: { ...typography.bodySm, color: palette.oxblood },
  changeBox: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, alignItems: 'center' },
  changeInput: {
    flex: 1,
    minHeight: hitTarget.preferred,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: palette.paperWhite,
    ...typography.bodySm,
    color: palette.charcoal,
  },
  footerRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.xs },
  footerBtn: { minHeight: hitTarget.min, justifyContent: 'center', paddingHorizontal: spacing.sm },
  footerBtnLabel: { ...typography.bodySm, color: palette.charcoalSoft },
  dangerLabel: { color: palette.danger },
  editorCard: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: palette.sandSoft,
  },
  editorTitle: { ...typography.headline, color: palette.charcoal, marginBottom: spacing.xs },
  label: { ...typography.bodySm, color: palette.charcoalSoft, marginTop: spacing.md, marginBottom: spacing.xs },
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
  lookRowActive: { backgroundColor: palette.paperWhite },
  lookCover: { width: 40, height: 54, borderRadius: radius.sm, backgroundColor: palette.paperWhite },
  lookCoverBlank: { borderWidth: StyleSheet.hairlineWidth, borderColor: palette.hairline },
  pickedMark: { ...typography.body, color: palette.oxblood },
  editorActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  saveBtnDisabled: { opacity: 0.6 },
  addBtn: {
    minHeight: hitTarget.preferred,
    marginTop: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: palette.oxblood,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnLabel: { ...typography.body, color: palette.white },
});
