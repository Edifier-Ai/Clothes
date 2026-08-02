import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { hitTarget, palette, radius, spacing, typography } from '@/design-system';
import type { LookDetail, LookItemInput } from '@/core/db/dao';
import type { LookSlot } from '@/core/db/schema';
import { originalUri } from '@/core/files/uri';
import type { LookItemGeom } from '@/core/looks/geometry';
import { validateSlotAssignment } from '@/core/looks/slots';
import { saveLook } from '@/core/looks/lookService';
import { uuidv7 } from '@/core/id/uuidv7';
import { GarmentPicker } from './GarmentPicker';
import type { PickCandidate } from './pickFilter';
import { SLOT_LABEL, SLOT_LAYOUT, SLOT_ORDER } from './slotLayout';
import { useLookDraft } from './useLookDraft';

export interface SlotsEditorProps {
  candidates: readonly PickCandidate[];
  onSaved: (detail: LookDetail) => void | Promise<void>;
  /** 有未保存改动时上报（路由层据此做退出提示）。 */
  onDirtyChange?: (dirty: boolean) => void;
}

const MISSING_ORDER: readonly LookSlot[] = ['top', 'bottom', 'shoes'];

const CONFLICT_LABEL: Record<string, string> = {
  'dress-excludes-top': '连衣裙与上装互斥',
  'dress-excludes-bottom': '连衣裙与下装互斥',
};

function conflictText(code: string): string {
  if (CONFLICT_LABEL[code]) return CONFLICT_LABEL[code];
  if (code.startsWith('duplicate-slot-')) return `${SLOT_LABEL[code.slice('duplicate-slot-'.length) as LookSlot] ?? ''}槽位重复`;
  return code;
}

/** 草稿 items（slot 维度，id 用 slot- 前缀仅作草稿标识，正式保存时另发 uuidv7）。 */
function assignToDraftItems(assign: Partial<Record<LookSlot, PickCandidate>>): LookItemGeom[] {
  return SLOT_ORDER.filter((s) => assign[s]).map((slot) => ({
    id: `slot-${slot}`,
    garmentId: assign[slot]!.id,
    slot,
    ...SLOT_LAYOUT[slot],
    rotation: 0,
    zIndex: SLOT_ORDER.indexOf(slot),
    ord: 0,
  }));
}

/**
 * 快速槽位编辑器（LOK-02）：六槽位点选，合法性由 core slots.ts 判定，
 * 缺项/冲突时保存禁用并说明；保存走 lookService.saveLook(mode='slots')。
 * 改动自动存草稿，重进提示恢复。
 */
export function SlotsEditor({ candidates, onSaved, onDirtyChange }: SlotsEditorProps) {
  const [name, setName] = useState('');
  const [assign, setAssign] = useState<Partial<Record<LookSlot, PickCandidate>>>({});
  const [activeSlot, setActiveSlot] = useState<LookSlot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draftItems = useMemo(() => assignToDraftItems(assign), [assign]);
  const draft = useLookDraft({
    mode: 'slots',
    name,
    items: draftItems,
    onRestore: (d) => {
      setName(d.name);
      const next: Partial<Record<LookSlot, PickCandidate>> = {};
      for (const it of d.items) {
        if (!it.slot) continue;
        const found = candidates.find((c) => c.id === it.garmentId);
        if (found) next[it.slot] = found;
      }
      setAssign(next);
    },
  });

  // 未保存改动上报（路由层退出提示用）
  useEffect(() => {
    onDirtyChange?.(draftItems.length > 0 || name.trim() !== '');
  }, [draftItems, name, onDirtyChange]);

  const validation = useMemo(
    () =>
      validateSlotAssignment(
        SLOT_ORDER.filter((s) => assign[s]).map((slot) => ({
          id: `slot-${slot}`,
          garmentId: assign[slot]!.id,
          slot,
        })),
      ),
    [assign],
  );

  const hint = useMemo(() => {
    const parts: string[] = [];
    if (validation.missing.length > 0) {
      const ordered = MISSING_ORDER.filter((s) => validation.missing.includes(s));
      parts.push(`还缺：${ordered.map((s) => SLOT_LABEL[s]).join('、')}`);
    }
    for (const c of validation.conflicts) parts.push(conflictText(c));
    return parts.join('；');
  }, [validation]);

  const selectedIds = useMemo(
    () => new Set(Object.values(assign).map((c) => c!.id)),
    [assign],
  );

  const save = async () => {
    if (!validation.ok || busy) return;
    setBusy(true);
    setError(null);
    try {
      const items: LookItemInput[] = SLOT_ORDER.filter((s) => assign[s]).map((slot) => ({
        id: uuidv7(),
        garmentId: assign[slot]!.id,
        slot,
        ...SLOT_LAYOUT[slot],
        rotation: 0,
        zIndex: SLOT_ORDER.indexOf(slot),
        ord: 0,
      }));
      const detail = await saveLook({ name: name.trim() || '未命名造型', mode: 'slots', items });
      await draft.markSaved();
      await onSaved(detail);
    } catch {
      setError('保存失败，请重试');
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      {draft.pendingDraft ? (
        <View style={styles.draftBar}>
          <Text style={styles.draftText}>恢复上次未保存的造型？</Text>
          <Pressable accessibilityRole="button" onPress={draft.acceptDraft} style={styles.draftBtn}>
            <Text style={styles.draftBtnLabel}>恢复</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={draft.dismissDraft} style={styles.draftBtn}>
            <Text style={styles.draftBtnLabel}>放弃</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.label}>造型名称</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="未命名造型"
        placeholderTextColor={palette.charcoalSoft}
        style={styles.nameInput}
        accessibilityLabel="造型名称"
      />

      <View style={styles.slotGrid}>
        {SLOT_ORDER.map((slot) => {
          const picked = assign[slot];
          return (
            <View key={slot} style={styles.slotCard}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setActiveSlot(slot)}
                style={({ pressed }) => [styles.slotBody, pressed && styles.slotPressed]}
              >
                {picked ? (
                  <>
                    {picked.imageRelPath ? (
                      <Image source={{ uri: originalUri(picked.imageRelPath) }} style={styles.slotThumb} contentFit="contain" />
                    ) : (
                      <View style={[styles.slotThumb, styles.slotThumbEmpty]} />
                    )}
                    <Text style={styles.slotName} numberOfLines={1}>
                      {picked.name}
                    </Text>
                    <Text style={styles.slotLabel}>{SLOT_LABEL[slot]} · 点按更换</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.slotPlus}>＋</Text>
                    <Text style={styles.slotLabel}>选择{SLOT_LABEL[slot]}</Text>
                  </>
                )}
              </Pressable>
              {picked ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`移除${SLOT_LABEL[slot]}`}
                  onPress={() => setAssign((a) => ({ ...a, [slot]: undefined }))}
                  style={styles.removeBtn}
                >
                  <Text style={styles.removeText}>✕</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </View>

      <View style={styles.footer}>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !validation.ok || busy, busy }}
          disabled={!validation.ok || busy}
          onPress={save}
          style={[styles.saveBtn, (!validation.ok || busy) && styles.saveBtnDisabled]}
        >
          {busy ? <ActivityIndicator color={palette.white} /> : <Text style={styles.saveLabel}>保存造型</Text>}
        </Pressable>
      </View>

      {activeSlot ? (
        <GarmentPicker
          candidates={candidates}
          slot={activeSlot}
          selectedIds={selectedIds}
          onPick={(c) => {
            setAssign((a) => ({ ...a, [activeSlot]: c }));
            setActiveSlot(null);
          }}
          onClose={() => setActiveSlot(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.paperWhite },
  draftBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    padding: spacing.sm,
    backgroundColor: palette.sandSoft,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
  },
  draftText: { ...typography.bodySm, color: palette.charcoal, flex: 1 },
  draftBtn: { minHeight: hitTarget.min, justifyContent: 'center', paddingHorizontal: spacing.xs },
  draftBtnLabel: { ...typography.bodySm, color: palette.oxblood },
  label: { ...typography.bodySm, color: palette.charcoalSoft, marginHorizontal: spacing.lg, marginTop: spacing.sm },
  nameInput: {
    ...typography.body,
    color: palette.charcoal,
    backgroundColor: palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    minHeight: hitTarget.min,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xxs,
  },
  slotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  slotCard: { width: '50%', padding: spacing.xs },
  slotBody: {
    minHeight: 120,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    backgroundColor: palette.sandSoft,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.sm,
  },
  slotPressed: { backgroundColor: palette.sand },
  slotPlus: { ...typography.title, color: palette.mutedGold },
  slotLabel: { ...typography.bodySm, color: palette.charcoalSoft, marginTop: spacing.xxs },
  slotThumb: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: palette.white },
  slotThumbEmpty: { borderWidth: StyleSheet.hairlineWidth, borderColor: palette.hairline },
  slotName: { ...typography.bodySm, color: palette.charcoal, marginTop: spacing.xxs },
  removeBtn: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: hitTarget.min,
    minHeight: hitTarget.min,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeText: { ...typography.bodySm, color: palette.danger },
  footer: { padding: spacing.lg, paddingBottom: spacing.md },
  hint: { ...typography.bodySm, color: palette.charcoalSoft, marginBottom: spacing.xs },
  errorText: { ...typography.bodySm, color: palette.danger, marginBottom: spacing.xs },
  saveBtn: {
    minHeight: hitTarget.preferred,
    borderRadius: radius.md,
    backgroundColor: palette.oxblood,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtnDisabled: { backgroundColor: palette.hairline },
  saveLabel: { ...typography.body, color: palette.white },
});
