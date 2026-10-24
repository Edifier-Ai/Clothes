import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

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
  rootAbs,
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
import {
  cancel,
  clearSourceStaged,
  listAll,
  type CutoutQueueItem,
} from '@/core/db/queue';
import { writeMirror } from '@/core/garments/mirror';
import {
  createCameraCapture,
  editorRouteFor,
  fileUri,
  nextSucceededGarmentId,
  QUEUE_STATUS_LABEL,
} from '@/features/cutout/importFlow';

type App = Awaited<ReturnType<typeof openAppDb>>;

const EMPTY_FORM: TencentCiConfig = { secretId: '', secretKey: '', bucket: '', region: '' };
const captureCamera = createCameraCapture(ImagePicker);

/** 批量抠图导入 IMP-02：多选→持久队列→顺序处理→进度→失败重试/跳过。抠图走腾讯云数据万象（需配置+告知确认）。 */
export default function BatchImportScreen() {
  const router = useRouter();
  const [snap, setSnap] = useState<QueueSnapshot | null>(null);
  const [items, setItems] = useState<CutoutQueueItem[]>([]);
  const [networkPending, setNetworkPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [cameraSeries, setCameraSeries] = useState(false);
  const [reviewJobId, setReviewJobId] = useState<string | null>(null);
  const [reviewedJobIds, setReviewedJobIds] = useState<Set<string>>(() => new Set());
  const [status, setStatus] = useState('');
  /** null=加载中；配置四字段是否齐全 */
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [consent, setConsent] = useState(false);
  const [form, setForm] = useState<TencentCiConfig>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const appRef = useRef<App | null>(null);

  const refreshQueue = useCallback(async (app: App) => {
    setSnap(await getSnapshot(app));
    setNetworkPending(await countNetworkPending(app));
    setItems(await listAll(app.drizzleDb));
  }, []);

  const runQueue = useCallback(async (app: App) => {
    await startProcessing(app, (s) => setSnap(s));
    await refreshQueue(app);
  }, [refreshQueue]);

  useEffect(() => {
    void (async () => {
      await ensureDirs();
      const app = await openAppDb();
      appRef.current = app;
      await restoreOnBoot(app);
      const s0 = await getSnapshot(app);
      await refreshQueue(app);
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
  }, [refreshQueue, runQueue]);

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

  const importPicked = async (picked: { uri: string; ext: string }[], source: '相册' | '相机') => {
    const app = appRef.current;
    if (!app || picked.length === 0) return;
    setBusy(true);
    try {
      if (configured === true && consent) {
        setStatus(`${source}照片入队中…`);
        await enqueueBatch(app, picked);
        await refreshQueue(app);
        setStatus('抠图处理中…');
        await runQueue(app);
        setStatus(`已处理 ${picked.length} 张，成功项请逐件审核。`);
      } else {
        setStatus(`${source}照片原图入库中…`);
        for (const p of picked) await addOriginalOnly(app, { uri: p.uri, ext: p.ext });
        setStatus(`已将 ${picked.length} 张原图安全入库；未授权云抠图，因此没有上传。`);
        await refreshQueue(app);
      }
    } catch (error) {
      setStatus(`导入失败：${error instanceof Error ? error.message : String(error)}。原图不会被覆盖。`);
    } finally {
      setBusy(false);
    }
  };

  /** 单张与连续拍摄共用：权限只在这个用户点击动作里请求。 */
  const takePhoto = async (continueSeries: boolean) => {
    const result = await captureCamera();
    if (result.kind === 'denied') {
      setStatus('未获得相机权限。你仍可使用相册导入，也可稍后在系统设置中开启。');
      setCameraSeries(false);
      return;
    }
    if (result.kind === 'cancelled') return;
    if (continueSeries) setCameraSeries(true);
    await importPicked([result.picked], '相机');
  };

  /** 已配置+已同意：多选 → 入队 → 顺序云抠图。 */
  const pickAndEnqueue = async () => {
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
    await importPicked(picked, '相册');
  };

  /** 同意告知并继续：持久化确认 → 选图 → 入队 → 处理（含此前积压的 pending）。 */
  const agreeAndContinue = async () => {
    const app = appRef.current;
    if (!app) return;
    await grantUploadConsent();
    setConsent(true);
    const picked = await pickImages();
    if (picked) {
      setBusy(true);
      try {
        setStatus('入队中…');
        await enqueueBatch(app, picked);
        await refreshQueue(app);
        setStatus('处理中…');
        await runQueue(app);
        setStatus('完成，成功项请逐件审核。');
      } finally {
        setBusy(false);
      }
      return;
    }
    await refreshQueue(app);
  };

  /** 拒绝上传：不抠图，衣物以原图入库（蒙版后续可补）。 */
  const importOriginalOnly = async () => {
    const app = appRef.current;
    if (!app) return;
    const picked = await pickImages();
    if (!picked) return;
    setBusy(true);
    try {
      setStatus('原图入库中…');
      for (const p of picked) {
        await addOriginalOnly(app, { uri: p.uri, ext: p.ext });
      }
      setStatus(`已原图入库 ${picked.length} 件；没有上传，可在确认告知后补抠图。`);
    } catch (error) {
      setStatus(`原图导入失败：${error instanceof Error ? error.message : String(error)}。`);
    } finally {
      setBusy(false);
    }
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

  const skipItem = async (item: CutoutQueueItem) => {
    const app = appRef.current;
    if (!app || !['pending', 'failed'].includes(item.job.status)) return;
    setBusy(true);
    try {
      await cancel(app.drizzleDb, item.job.id, Date.now());
      // 只清理队列暂存副本；originals/ 中已入库原图及衣物记录绝不删除。
      if (item.job.sourceStagedPath) {
        await FileSystem.deleteAsync(item.job.sourceStagedPath, { idempotent: true }).catch(() => undefined);
        await clearSourceStaged(app.drizzleDb, item.job.id, Date.now());
      }
      await writeMirror(rootAbs(), app.db, app.drizzleDb, Date.now());
      await refreshQueue(app);
      setStatus(`已跳过「${item.garmentName}」的抠图；原图仍安全保留在衣橱。`);
    } finally {
      setBusy(false);
    }
  };

  const acceptReview = (item: CutoutQueueItem) => {
    const reviewed = new Set(reviewedJobIds);
    reviewed.add(item.job.id);
    setReviewedJobIds(reviewed);
    const next = items.find(
      (candidate) => candidate.job.status === 'succeeded'
        && candidate.job.id !== item.job.id
        && !reviewed.has(candidate.job.id),
    );
    setReviewJobId(next?.job.id ?? null);
    setStatus(next ? '已接受，继续审核下一件。' : '本批成功项已审核完，可返回衣橱继续整理。');
  };

  const ready = configured === true && consent;
  const reviewItem = reviewJobId ? items.find((item) => item.job.id === reviewJobId) ?? null : null;
  const reviewNextId = reviewItem ? nextSucceededGarmentId(items, reviewItem.job.id, reviewedJobIds) : undefined;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>批量导入</Text>
      <Text style={styles.sub}>选择多张衣物照片，云端抠图（腾讯云数据万象）；中断后可从此处继续。</Text>

      {configured === false ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>配置抠图服务</Text>
          <Text style={styles.cardHint}>填入腾讯云数据万象凭证，仅保存在本机安全存储。</Text>
          <Text style={styles.cardHint}>
            建议使用 CAM 子账号密钥，只授权该存储桶的上传、下载、删除对象权限，不要填写主账号密钥。
          </Text>
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
            抠图会把选中的照片上传至腾讯云数据万象处理；App 在处理完成后请求删除 COS 暂存对象，
            云服务处理受腾讯条款约束；凭证只保存在本机。确认后才会入队抠图。
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
      {configured === false ? (
        <Pressable accessibilityRole="button" onPress={importOriginalOnly} disabled={busy} style={[styles.btnGhost, busy && styles.btnDisabled]}>
          <Text style={styles.btnGhostLabel}>不配置服务，仅导入原图</Text>
        </Pressable>
      ) : null}

      <View style={styles.captureRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="拍一件"
          onPress={() => void takePhoto(false)}
          disabled={busy}
          style={[styles.btnGhost, styles.captureButton, busy && styles.btnDisabled]}
        >
          <Text style={styles.btnGhostLabel}>拍一件</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={cameraSeries ? '继续拍一件' : '开始连续拍摄'}
          onPress={() => void takePhoto(true)}
          disabled={busy}
          style={[styles.btnGhost, styles.captureButton, cameraSeries && styles.selectedButton, busy && styles.btnDisabled]}
        >
          <Text style={[styles.btnGhostLabel, cameraSeries && styles.selectedButtonLabel]}>
            {cameraSeries ? '继续拍一件' : '连续拍摄'}
          </Text>
        </Pressable>
      </View>
      {cameraSeries ? (
        <Pressable accessibilityRole="button" onPress={() => setCameraSeries(false)} style={styles.finishSeries}>
          <Text style={styles.finishSeriesLabel}>结束连续拍摄</Text>
        </Pressable>
      ) : null}
      <Text style={styles.permissionHint}>相机权限只会在你点击拍摄后请求；拒绝后仍可使用相册。</Text>

      {snap ? (
        <View style={styles.progress}>
          <Text style={styles.cardTitle}>处理进度</Text>
          <Text style={styles.line}>待处理 {snap.pending} · 处理中 {snap.running} · 待审核 {snap.succeeded}</Text>
          <Text style={styles.line}>失败 {snap.failed} · 已跳过 {snap.cancelled} · 共 {snap.total}</Text>
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

      {items.length > 0 ? (
        <View style={styles.queueSection}>
          <Text style={styles.sectionTitle}>逐件处理</Text>
          {items.map((item, index) => {
            const preview = fileUri(
              rootAbs(),
              item.job.thumbnailRelPath ?? item.originalRelPath ?? item.job.originalRelPath ?? item.job.sourceStagedPath,
            );
            const succeeded = item.job.status === 'succeeded';
            const canSkip = item.job.status === 'pending' || item.job.status === 'failed';
            return (
              <View key={item.job.id} style={[styles.queueItem, reviewJobId === item.job.id && styles.queueItemSelected]}>
                {preview ? (
                  <Image source={{ uri: preview }} style={styles.thumbnail} accessibilityLabel={`${item.garmentName}缩略图`} />
                ) : (
                  <View style={styles.thumbnailPlaceholder}><Text style={styles.thumbnailNumber}>{index + 1}</Text></View>
                )}
                <View style={styles.queueBody}>
                  <Text style={styles.itemName}>{item.garmentName}</Text>
                  <Text style={[styles.itemStatus, succeeded && styles.itemStatusReady]}>
                    {reviewedJobIds.has(item.job.id) ? '已审核' : QUEUE_STATUS_LABEL[item.job.status] ?? '未知状态'}
                  </Text>
                  {item.job.errorMessage ? (
                    <Text style={styles.itemError} numberOfLines={3}>
                      {item.job.errorCode ? `${item.job.errorCode}：` : ''}{item.job.errorMessage}
                    </Text>
                  ) : null}
                </View>
                {succeeded ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`审核${item.garmentName}`}
                    onPress={() => setReviewJobId(item.job.id)}
                    style={styles.itemAction}
                  >
                    <Text style={styles.itemActionLabel}>审核</Text>
                  </Pressable>
                ) : null}
                {canSkip ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`跳过${item.garmentName}`}
                    onPress={() => void skipItem(item)}
                    disabled={busy}
                    style={styles.itemAction}
                  >
                    <Text style={styles.skipLabel}>跳过</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {reviewItem ? (
        <View style={styles.reviewCard}>
          <Text style={styles.sectionTitle}>审核 · {reviewItem.garmentName}</Text>
          <Text style={styles.cardHint}>先对比原图与透明预览。效果满意就接受；边缘有缺口或残留再进入修边。</Text>
          <View style={styles.compareRow}>
            <View style={styles.compareCell}>
              <Text style={styles.compareLabel}>原图</Text>
              <Image
                accessibilityLabel="审核原图"
                source={{ uri: fileUri(rootAbs(), reviewItem.originalRelPath ?? reviewItem.job.originalRelPath) ?? '' }}
                style={styles.compareImage}
                resizeMode="contain"
              />
            </View>
            <View style={styles.compareCell}>
              <Text style={styles.compareLabel}>抠图预览</Text>
              <Image
                accessibilityLabel="抠图预览"
                source={{ uri: fileUri(rootAbs(), reviewItem.job.previewRelPath) ?? '' }}
                style={styles.compareImage}
                resizeMode="contain"
              />
            </View>
          </View>
          <Pressable accessibilityRole="button" onPress={() => acceptReview(reviewItem)} style={styles.btn}>
            <Text style={styles.btnLabel}>接受效果{reviewNextId ? '并审核下一件' : ''}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(editorRouteFor(reviewItem, reviewNextId))}
            style={styles.btnGhost}
          >
            <Text style={styles.btnGhostLabel}>进入修边</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.note}>
        说明：抠图使用腾讯云数据万象 GoodsMatting；App 在处理完成后请求删除 COS 暂存对象，云服务处理受腾讯条款约束。
        失败可重试或跳过，不阻塞衣物入库；杀进程后重启，已提交任务不重做，剩余任务恢复。
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, backgroundColor: palette.paperWhite },
  title: { ...typography.title, color: palette.charcoal },
  sub: { ...typography.bodySm, color: palette.charcoalSoft, marginTop: spacing.xs, marginBottom: spacing.md },
  card: { padding: spacing.md, backgroundColor: palette.sandSoft, borderRadius: radius.sm, marginBottom: spacing.md, borderWidth: 1, borderColor: palette.hairline },
  cardTitle: { ...typography.headline, color: palette.charcoal },
  cardHint: { ...typography.bodySm, color: palette.charcoalSoft, marginTop: spacing.xs, marginBottom: spacing.sm },
  input: { minHeight: hitTarget.min, borderRadius: radius.md, backgroundColor: palette.white, borderWidth: 1, borderColor: palette.hairline, paddingHorizontal: spacing.sm, marginBottom: spacing.sm, ...typography.bodySm, color: palette.charcoal },
  error: { ...typography.bodySm, color: palette.danger, marginBottom: spacing.sm },
  configLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  clearBtn: { minHeight: hitTarget.min, justifyContent: 'center', paddingHorizontal: spacing.sm },
  clearBtnLabel: { ...typography.bodySm, color: palette.danger },
  btn: { minHeight: hitTarget.preferred, borderRadius: radius.sm, backgroundColor: palette.charcoal, justifyContent: 'center', alignItems: 'center' },
  btnGhost: { marginTop: spacing.sm, minHeight: hitTarget.preferred, borderRadius: radius.sm, borderWidth: 1, borderColor: palette.charcoal, justifyContent: 'center', alignItems: 'center' },
  btnGhostLabel: { ...typography.body, color: palette.charcoal },
  btnDisabled: { opacity: 0.5 },
  btnLabel: { ...typography.body, color: palette.white },
  captureRow: { flexDirection: 'row', gap: spacing.sm },
  captureButton: { flex: 1 },
  selectedButton: { backgroundColor: palette.oxblood, borderColor: palette.oxblood },
  selectedButtonLabel: { color: palette.white },
  finishSeries: { minHeight: hitTarget.min, alignItems: 'center', justifyContent: 'center' },
  finishSeriesLabel: { ...typography.bodySm, color: palette.oxblood },
  permissionHint: { ...typography.caption, color: palette.charcoalSoft, marginTop: spacing.xs },
  progress: { marginTop: spacing.lg, padding: spacing.md, backgroundColor: palette.sandSoft, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.hairline },
  line: { ...typography.bodySm, color: palette.charcoal, marginTop: spacing.xxs },
  hint: { ...typography.bodySm, color: palette.oxblood, marginTop: spacing.xs },
  spinner: { marginTop: spacing.sm },
  status: { ...typography.bodySm, color: palette.oxblood, marginTop: spacing.xs },
  retry: { marginTop: spacing.sm, minHeight: hitTarget.min, borderRadius: radius.md, backgroundColor: palette.charcoal, justifyContent: 'center', alignItems: 'center' },
  queueSection: { marginTop: spacing.lg },
  sectionTitle: { ...typography.headline, color: palette.charcoal, marginBottom: spacing.sm },
  queueItem: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.hairline },
  queueItemSelected: { borderLeftWidth: 3, borderLeftColor: palette.oxblood, paddingLeft: spacing.xs },
  thumbnail: { width: 64, height: 64, backgroundColor: palette.sandSoft },
  thumbnailPlaceholder: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.sandSoft },
  thumbnailNumber: { ...typography.display, color: palette.mutedGold },
  queueBody: { flex: 1 },
  itemName: { ...typography.body, color: palette.charcoal },
  itemStatus: { ...typography.caption, color: palette.charcoalSoft, marginTop: spacing.xxs },
  itemStatusReady: { color: palette.oxblood },
  itemError: { ...typography.caption, color: palette.danger, marginTop: spacing.xxs },
  itemAction: { minWidth: 52, minHeight: hitTarget.min, alignItems: 'center', justifyContent: 'center' },
  itemActionLabel: { ...typography.bodySm, color: palette.oxblood },
  skipLabel: { ...typography.bodySm, color: palette.danger },
  reviewCard: { marginTop: spacing.lg, paddingVertical: spacing.lg, borderTopWidth: 1, borderTopColor: palette.charcoal },
  compareRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  compareCell: { flex: 1 },
  compareLabel: { ...typography.caption, color: palette.charcoalSoft, marginBottom: spacing.xs },
  compareImage: { width: '100%', aspectRatio: 0.8, backgroundColor: palette.sandSoft, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.hairline },
  note: { ...typography.caption, color: palette.charcoalSoft, marginTop: spacing.lg },
});
