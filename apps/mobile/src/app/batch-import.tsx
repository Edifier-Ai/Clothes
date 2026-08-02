import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { hitTarget, palette, radius, spacing, typography } from '@/design-system';
import { openAppDb } from '@/core/db/expoDb';
import {
  addOriginalOnly,
  countNetworkPending,
  enqueueBatch,
  ensureDirs,
  getSnapshot,
  restoreOnBoot,
  retryFailed,
  startProcessing,
} from '@/core/cutout/cutoutService';
import {
  clearTencentCiConfig,
  grantUploadConsent,
  hasUploadConsent,
  loadTencentCiConfig,
  missingTencentCiFields,
  saveTencentCiConfig,
} from '@/core/cutout/apiConfig';
import type { TencentCiConfig } from '@/native/tencentCiEngine';
import type { QueueSnapshot } from '@/core/cutout/processor';
import { extFromUri } from '@/core/files/uri';

type App = Awaited<ReturnType<typeof openAppDb>>;

const EMPTY_FORM: TencentCiConfig = { secretId: '', secretKey: '', bucket: '', region: '' };

/** 批量抠图导入 IMP-02：多选→持久队列→顺序处理→进度→失败重试/跳过。抠图走腾讯云数据万象（需配置+告知确认）。 */
export default function BatchImportScreen() {
  const [snap, setSnap] = useState<QueueSnapshot | null>(null);
  const [networkPending, setNetworkPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  /** null=加载中；配置四字段是否齐全 */
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [consent, setConsent] = useState(false);
  const [form, setForm] = useState<TencentCiConfig>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const appRef = useRef<App | null>(null);

  const refreshQueue = async (app: App) => {
    setSnap(await getSnapshot(app));
    setNetworkPending(await countNetworkPending(app));
  };

  const runQueue = async (app: App) => {
    await startProcessing(app, (s) => setSnap(s));
    await refreshQueue(app);
  };

  useEffect(() => {
    void (async () => {
      await ensureDirs();
      const app = await openAppDb();
      appRef.current = app;
      await restoreOnBoot(app);
      const s0 = await getSnapshot(app);
      setSnap(s0);
      setNetworkPending(await countNetworkPending(app));
      const config = await loadTencentCiConfig();
      const ok = missingTencentCiFields(config).length === 0;
      setConfigured(ok);
      const consented = ok ? await hasUploadConsent() : false;
      setConsent(consented);
      // 中断自动续跑：凭证+同意齐全且有 pending/running 任务（杀进程/断网中断）时
      // 从已提交位置继续；startProcessing 内 recover 会把 running 安全重置为 pending。
      if (ok && consented && (s0.pending > 0 || s0.running > 0)) {
        setBusy(true);
        setStatus('恢复中断的任务，继续处理中…');
        await runQueue(app);
        setStatus('完成');
        setBusy(false);
      }
    })();
  }, []);

  const saveConfig = async () => {
    const missing = missingTencentCiFields(form);
    if (missing.length > 0) {
      setFormError(`请填写完整：${missing.join('、')}`);
      return;
    }
    await saveTencentCiConfig({
      secretId: form.secretId.trim(),
      secretKey: form.secretKey.trim(),
      bucket: form.bucket.trim(),
      region: form.region.trim(),
    });
    setFormError('');
    setConfigured(true);
    setConsent(false); // 新凭证需重新确认上传告知
    setStatus('配置已保存（仅存本机）。首次抠图前需确认上传告知。');
  };

  const clearConfig = async () => {
    await clearTencentCiConfig();
    setConfigured(false);
    setConsent(false);
    setForm(EMPTY_FORM);
    setStatus('已清除本机保存的抠图服务配置。');
  };

  const pickImages = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.9,
    });
    if (res.canceled || !res.assets.length) return null;
    return res.assets.map((a) => ({ uri: a.uri, ext: extFromUri(a.uri, a.mimeType) }));
  };

  /** 已配置+已同意：多选 → 入队 → 顺序云抠图。 */
  const pickAndEnqueue = async () => {
    const app = appRef.current;
    if (!app) return;
    if (!configured) {
      setStatus('请先配置抠图服务（上方四个字段）。');
      return;
    }
    if (!consent) {
      setStatus('请先阅读并确认上方的上传告知，确认后才会入队抠图。');
      return;
    }
    const picked = await pickImages();
    if (!picked) return;
    setBusy(true);
    setStatus('入队中…');
    await enqueueBatch(app, picked);
    await refreshQueue(app);
    setStatus('处理中…');
    await runQueue(app);
    setStatus('完成');
    setBusy(false);
  };

  /** 同意告知并继续：持久化确认 → 选图 → 入队 → 处理（含此前积压的 pending）。 */
  const agreeAndContinue = async () => {
    const app = appRef.current;
    if (!app) return;
    await grantUploadConsent();
    setConsent(true);
    const picked = await pickImages();
    setBusy(true);
    if (picked) {
      setStatus('入队中…');
      await enqueueBatch(app, picked);
    }
    await refreshQueue(app);
    setStatus('处理中…');
    await runQueue(app);
    setStatus('完成');
    setBusy(false);
  };

  /** 拒绝上传：不抠图，衣物以原图入库（蒙版后续可补）。 */
  const importOriginalOnly = async () => {
    const app = appRef.current;
    if (!app) return;
    const picked = await pickImages();
    if (!picked) return;
    setBusy(true);
    setStatus('原图入库中…');
    for (const p of picked) {
      await addOriginalOnly(app, { uri: p.uri, ext: p.ext });
    }
    setStatus(`已原图入库 ${picked.length} 件（未抠图，可在确认告知后补抠）。`);
    setBusy(false);
  };

  const retry = async () => {
    const app = appRef.current;
    if (!app) return;
    setBusy(true);
    setStatus('重试处理中…');
    await retryFailed(app, (s) => setSnap(s));
    await refreshQueue(app);
    setStatus('完成');
    setBusy(false);
  };

  const resume = async () => {
    const app = appRef.current;
    if (!app) return;
    setBusy(true);
    setStatus('继续处理中…');
    await runQueue(app);
    setStatus('完成');
    setBusy(false);
  };

  const ready = configured === true && consent;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>批量导入</Text>
      <Text style={styles.sub}>选择多张衣物照片，云端抠图（腾讯云数据万象）；中断后可从此处继续。</Text>

      {configured === false ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>配置抠图服务</Text>
          <Text style={styles.cardHint}>填入腾讯云数据万象凭证，仅保存在本机安全存储。</Text>
          <TextInput
            style={styles.input}
            placeholder="secretId"
            placeholderTextColor={palette.charcoalSoft}
            autoCapitalize="none"
            autoCorrect={false}
            value={form.secretId}
            onChangeText={(v) => setForm((f) => ({ ...f, secretId: v }))}
          />
          <TextInput
            style={styles.input}
            placeholder="secretKey"
            placeholderTextColor={palette.charcoalSoft}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            value={form.secretKey}
            onChangeText={(v) => setForm((f) => ({ ...f, secretKey: v }))}
          />
          <TextInput
            style={styles.input}
            placeholder="bucket（BucketName-APPID）"
            placeholderTextColor={palette.charcoalSoft}
            autoCapitalize="none"
            autoCorrect={false}
            value={form.bucket}
            onChangeText={(v) => setForm((f) => ({ ...f, bucket: v }))}
          />
          <TextInput
            style={styles.input}
            placeholder="region（如 ap-guangzhou）"
            placeholderTextColor={palette.charcoalSoft}
            autoCapitalize="none"
            autoCorrect={false}
            value={form.region}
            onChangeText={(v) => setForm((f) => ({ ...f, region: v }))}
          />
          {formError ? <Text style={styles.error}>{formError}</Text> : null}
          <Pressable accessibilityRole="button" onPress={saveConfig} style={styles.btn}>
            <Text style={styles.btnLabel}>保存配置</Text>
          </Pressable>
        </View>
      ) : null}

      {configured === true ? (
        <View style={styles.configLine}>
          <Text style={styles.line}>抠图服务：已配置（key 仅存本机）</Text>
          <Pressable accessibilityRole="button" onPress={clearConfig} style={styles.clearBtn}>
            <Text style={styles.clearBtnLabel}>清除配置</Text>
          </Pressable>
        </View>
      ) : null}

      {configured === true && !consent ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>上传告知</Text>
          <Text style={styles.cardHint}>
            抠图会把选中的照片上传至腾讯云数据万象处理；处理后即删除云端文件，不留存；
            凭证只保存在本机。确认后才会入队抠图。
          </Text>
          <Pressable accessibilityRole="button" onPress={agreeAndContinue} disabled={busy} style={[styles.btn, busy && styles.btnDisabled]}>
            <Text style={styles.btnLabel}>同意并继续</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={importOriginalOnly} disabled={busy} style={[styles.btnGhost, busy && styles.btnDisabled]}>
            <Text style={styles.btnGhostLabel}>暂不上传，仅原图入库</Text>
          </Pressable>
        </View>
      ) : null}

      <Pressable accessibilityRole="button" onPress={pickAndEnqueue} disabled={busy || !ready} style={[styles.btn, (busy || !ready) && styles.btnDisabled]}>
        <Text style={styles.btnLabel}>{busy ? '处理中…' : '从相册批量选择'}</Text>
      </Pressable>

      {snap ? (
        <View style={styles.progress}>
          <Text style={styles.line}>待处理 pending: {snap.pending}</Text>
          <Text style={styles.line}>处理中 running: {snap.running}</Text>
          <Text style={styles.line}>成功 succeeded: {snap.succeeded}</Text>
          <Text style={styles.line}>失败 failed: {snap.failed}</Text>
          <Text style={styles.line}>取消 cancelled: {snap.cancelled}</Text>
          <Text style={styles.line}>总计 total: {snap.total}</Text>
          {snap.pending > 0 && configured === false ? (
            <Text style={styles.hint}>待配置：保存抠图服务配置并确认告知后，这些任务自动可续跑。</Text>
          ) : null}
          {snap.pending > 0 && configured === true && !consent ? (
            <Text style={styles.hint}>待同意：确认上传告知后继续处理 {snap.pending} 张。</Text>
          ) : null}
          {networkPending > 0 && ready ? (
            <Text style={styles.hint}>断网待重试：{networkPending} 张因网络中断暂停，联网后点「继续处理」。</Text>
          ) : null}
          {snap.failed > 0 ? (
            <Text style={styles.hint}>失败可重试：{snap.failed} 张抠图报错（凭证无效/额度/图片异常），可重试或跳过。</Text>
          ) : null}
          {busy ? <ActivityIndicator style={styles.spinner} /> : null}
          {status ? <Text style={styles.status}>{status}</Text> : null}
          {((snap.pending ?? 0) > 0 || networkPending > 0) && ready && !busy ? (
            <Pressable accessibilityRole="button" onPress={resume} style={styles.retry}>
              <Text style={styles.btnLabel}>继续处理</Text>
            </Pressable>
          ) : null}
          {snap.failed > 0 && !busy ? (
            <Pressable accessibilityRole="button" onPress={retry} style={styles.retry}>
              <Text style={styles.btnLabel}>重试失败项</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <Text style={styles.note}>
        说明：抠图使用腾讯云数据万象 GoodsMatting，照片处理后即删不留存；失败可重试或跳过，不阻塞衣物入库；
        杀进程后重启，已提交任务不重做，剩余任务恢复。
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, backgroundColor: palette.paperWhite },
  title: { ...typography.title, color: palette.charcoal },
  sub: { ...typography.bodySm, color: palette.charcoalSoft, marginTop: spacing.xs, marginBottom: spacing.md },
  card: { padding: spacing.md, backgroundColor: palette.sandSoft, borderRadius: radius.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: palette.hairline },
  cardTitle: { ...typography.headline, color: palette.charcoal },
  cardHint: { ...typography.bodySm, color: palette.charcoalSoft, marginTop: spacing.xs, marginBottom: spacing.sm },
  input: { minHeight: hitTarget.min, borderRadius: radius.md, backgroundColor: palette.white, borderWidth: 1, borderColor: palette.hairline, paddingHorizontal: spacing.sm, marginBottom: spacing.sm, ...typography.bodySm, color: palette.charcoal },
  error: { ...typography.bodySm, color: palette.danger, marginBottom: spacing.sm },
  configLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  clearBtn: { minHeight: hitTarget.min, justifyContent: 'center', paddingHorizontal: spacing.sm },
  clearBtnLabel: { ...typography.bodySm, color: palette.danger },
  btn: { minHeight: hitTarget.preferred, borderRadius: radius.md, backgroundColor: palette.oxblood, justifyContent: 'center', alignItems: 'center' },
  btnGhost: { marginTop: spacing.sm, minHeight: hitTarget.preferred, borderRadius: radius.md, borderWidth: 1, borderColor: palette.oxblood, justifyContent: 'center', alignItems: 'center' },
  btnGhostLabel: { ...typography.body, color: palette.oxblood },
  btnDisabled: { opacity: 0.5 },
  btnLabel: { ...typography.body, color: palette.white },
  progress: { marginTop: spacing.lg, padding: spacing.md, backgroundColor: palette.sandSoft, borderRadius: radius.lg },
  line: { ...typography.bodySm, color: palette.charcoal, fontFamily: 'monospace' },
  hint: { ...typography.bodySm, color: palette.oxblood, marginTop: spacing.xs },
  spinner: { marginTop: spacing.sm },
  status: { ...typography.bodySm, color: palette.oxblood, marginTop: spacing.xs },
  retry: { marginTop: spacing.sm, minHeight: hitTarget.min, borderRadius: radius.md, backgroundColor: palette.charcoal, justifyContent: 'center', alignItems: 'center' },
  note: { ...typography.caption, color: palette.charcoalSoft, marginTop: spacing.lg },
});
