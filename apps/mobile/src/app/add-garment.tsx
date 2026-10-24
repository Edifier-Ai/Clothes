import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';

import { hitTarget, palette, radius, spacing, typography } from '@/design-system';
import { extFromUri } from '@/core/files/uri';
import {
  commitAdd,
  prepareAdd,
  type GarmentForm,
} from '@/core/garments/service';
import type { CreateGarmentInput } from '@/core/db/dao';
import type { StagedImage } from '@/core/files/imageStore';

const CATEGORIES: { value: CreateGarmentInput['category']; label: string }[] = [
  { value: 'top', label: '上装' },
  { value: 'bottom', label: '下装' },
  { value: 'dress', label: '连衣裙' },
  { value: 'shoes', label: '鞋' },
  { value: 'outerwear', label: '外套' },
  { value: 'accessory', label: '配饰' },
  { value: 'other', label: '其他' },
];

/**
 * 添加衣物（IMP-01 选图 + IMP-05 确认）。
 * 权限在点击后才申请；处理拒绝/取消/重复/写入失败，保存失败保留已填内容。
 */
export default function AddGarmentScreen() {
  const router = useRouter();
  const [picked, setPicked] = useState<{ uri: string; ext: string } | null>(null);
  const stagedRef = useRef<StagedImage | null>(null);
  const mountedRef = useRef(true);
  const [duplicate, setDuplicate] = useState<boolean>(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<GarmentForm>({
    name: '',
    category: 'top',
    color: '',
    season: '',
    occasion: '',
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const pending = stagedRef.current;
      stagedRef.current = null;
      if (pending) void pending.abort().catch(() => undefined);
    };
  }, []);

  const pick = useCallback(async () => {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('相册权限被拒绝。可在系统设置中开启后重试，照片不会离开本机。');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 0.9,
    });
    if (res.canceled || !res.assets[0]) return; // 取消：什么都不做
    const asset = res.assets[0];
    const ext = extFromUri(asset.uri, asset.mimeType);
    setBusy(true);
    try {
      const prepared = await prepareAdd(asset.uri, ext);
      if (!mountedRef.current) {
        await prepared.staged.abort().catch(() => undefined);
        return;
      }
      const previous = stagedRef.current;
      stagedRef.current = prepared.staged;
      setPicked({ uri: asset.uri, ext });
      setDuplicate(prepared.kind === 'duplicate');
      if (previous && previous !== prepared.staged) {
        await previous.abort().catch(() => undefined);
      }
    } catch {
      setError('读取图片失败：文件不可读或已损坏。');
    } finally {
      setBusy(false);
    }
  }, []);

  const save = useCallback(async () => {
    const staged = stagedRef.current;
    if (!staged || !picked) return;
    setBusy(true);
    setError(null);
    try {
      // prepareAdd 已完成校验/去重和暂存；保存必须提交同一份 staged，不能再次 prepare。
      await commitAdd(staged, form, picked.ext);
      if (stagedRef.current === staged) stagedRef.current = null;
      router.back();
    } catch {
      setError('保存失败：请重试。已填写的内容已保留。');
    } finally {
      setBusy(false);
    }
  }, [picked, form, router]);

  return (
    <View style={styles.root}>
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>添加衣物</Text>

      <Pressable
        accessibilityRole="button"
        onPress={pick}
        style={({ pressed }) => [styles.dropzone, pressed && styles.pressed]}
      >
        {picked ? (
          <Image source={{ uri: picked.uri }} style={styles.preview} contentFit="contain" />
        ) : (
          <Text style={styles.dropzoneText}>从相册选择一张衣物照片</Text>
        )}
      </Pressable>

      {duplicate ? (
        <Text style={styles.warn}>衣橱里已有相同图片的衣物。确认仍要添加为另一件，请保存。</Text>
      ) : null}

      <Field label="名称" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
      <Text style={styles.label}>类别</Text>
      <View style={styles.chipRow}>
        {CATEGORIES.map((c) => (
          <Pressable
            key={c.value}
            accessibilityRole="button"
            onPress={() => setForm({ ...form, category: c.value })}
            style={[styles.chip, form.category === c.value && styles.chipActive]}
          >
            <Text style={[styles.chipText, form.category === c.value && styles.chipTextActive]}>
              {c.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Field label="颜色（可选）" value={form.color ?? ''} onChangeText={(v) => setForm({ ...form, color: v })} />
      <Field label="季节（可选）" value={form.season ?? ''} onChangeText={(v) => setForm({ ...form, season: v })} />
      <Field label="场景（可选）" value={form.occasion ?? ''} onChangeText={(v) => setForm({ ...form, occasion: v })} />
    </ScrollView>

    <View style={styles.footer}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        accessibilityRole="button"
        disabled={!picked || busy}
        onPress={save}
        style={({ pressed }) => [
          styles.save,
          (!picked || busy) && styles.saveDisabled,
          pressed && picked && styles.pressed,
        ]}
      >
        {busy ? (
          <ActivityIndicator color={palette.white} />
        ) : (
          <Text style={styles.saveLabel}>保存衣物</Text>
        )}
      </Pressable>
    </View>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
}) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        style={styles.input}
        placeholderTextColor={palette.charcoalSoft}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.paperWhite },
  container: { padding: spacing.lg, paddingBottom: spacing.md, backgroundColor: palette.paperWhite },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg, backgroundColor: palette.paperWhite, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.hairline },
  title: { ...typography.title, color: palette.charcoal, marginBottom: spacing.md },
  dropzone: {
    height: 200,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    backgroundColor: palette.sandSoft,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  dropzoneText: { ...typography.body, color: palette.charcoalSoft },
  preview: { width: '100%', height: '100%' },
  pressed: { opacity: 0.85 },
  warn: { ...typography.bodySm, color: palette.oxblood, marginTop: spacing.sm },
  label: { ...typography.bodySm, color: palette.charcoalSoft, marginTop: spacing.md, marginBottom: spacing.xxs },
  input: {
    ...typography.body,
    color: palette.charcoal,
    backgroundColor: palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    minHeight: hitTarget.min,
  },
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
  error: { ...typography.bodySm, color: palette.danger, marginTop: spacing.md },
  save: {
    marginTop: spacing.lg,
    minHeight: hitTarget.preferred,
    borderRadius: radius.md,
    backgroundColor: palette.oxblood,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveDisabled: { opacity: 0.4 },
  saveLabel: { ...typography.body, color: palette.white },
});
