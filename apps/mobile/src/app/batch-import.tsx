import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { hitTarget, palette, radius, spacing, typography } from '@/design-system';
import { openAppDb } from '@/core/db/expoDb';
import {
  enqueueBatch,
  ensureDirs,
  getSnapshot,
  restoreOnBoot,
  startProcessing,
  type PickedForBatch,
} from '@/core/cutout/cutoutService';
import type { QueueSnapshot } from '@/core/cutout/processor';
import { extFromUri } from '@/core/files/uri';

/** 批量抠图导入 IMP-02：多选→持久队列→顺序处理→进度→失败重试/跳过。 */
export default function BatchImportScreen() {
  const [snap, setSnap] = useState<QueueSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const appRef = useRef<Awaited<ReturnType<typeof openAppDb>> | null>(null);

  useEffect(() => {
    void (async () => {
      await ensureDirs();
      const app = await openAppDb();
      appRef.current = app;
      await restoreOnBoot(app);
      setSnap(await getSnapshot(app));
    })();
  }, []);

  const pickAndEnqueue = async () => {
    if (!appRef.current) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.9,
    });
    if (res.canceled || !res.assets.length) return;
    setBusy(true);
    setStatus('入队中…');
    const picked: PickedForBatch[] = res.assets.map((a) => ({ uri: a.uri, ext: extFromUri(a.uri, a.mimeType) }));
    await enqueueBatch(appRef.current, picked);
    setSnap(await getSnapshot(appRef.current));
    setStatus('处理中…');
    await startProcessing(appRef.current, (s) => setSnap(s));
    setSnap(await getSnapshot(appRef.current));
    setStatus('完成');
    setBusy(false);
  };

  const retry = async () => {
    if (!appRef.current) return;
    setBusy(true);
    setStatus('重试处理中…');
    await startProcessing(appRef.current, (s) => setSnap(s));
    setSnap(await getSnapshot(appRef.current));
    setStatus('完成');
    setBusy(false);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>批量导入</Text>
      <Text style={styles.sub}>选择多张衣物照片，本地顺序抠图；中断后可从此处继续。</Text>

      <Pressable accessibilityRole="button" onPress={pickAndEnqueue} disabled={busy} style={[styles.btn, busy && styles.btnDisabled]}>
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
          {busy ? <ActivityIndicator style={styles.spinner} /> : null}
          {status ? <Text style={styles.status}>{status}</Text> : null}
          {snap.failed > 0 && !busy ? (
            <Pressable accessibilityRole="button" onPress={retry} style={styles.retry}>
              <Text style={styles.btnLabel}>重试失败项</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <Text style={styles.note}>
        说明：当前用 stub 抠图引擎（真模型待 MVP-002 解锁后注入）。失败可重试或跳过，不阻塞衣物入库；
        杀进程后重启，已提交任务不重做，剩余任务恢复。
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, backgroundColor: palette.paperWhite },
  title: { ...typography.title, color: palette.charcoal },
  sub: { ...typography.bodySm, color: palette.charcoalSoft, marginTop: spacing.xs, marginBottom: spacing.md },
  btn: { minHeight: hitTarget.preferred, borderRadius: radius.md, backgroundColor: palette.oxblood, justifyContent: 'center', alignItems: 'center' },
  btnDisabled: { opacity: 0.5 },
  btnLabel: { ...typography.body, color: palette.white },
  progress: { marginTop: spacing.lg, padding: spacing.md, backgroundColor: palette.sandSoft, borderRadius: radius.lg },
  line: { ...typography.bodySm, color: palette.charcoal, fontFamily: 'monospace' },
  spinner: { marginTop: spacing.sm },
  status: { ...typography.bodySm, color: palette.oxblood, marginTop: spacing.xs },
  retry: { marginTop: spacing.sm, minHeight: hitTarget.min, borderRadius: radius.md, backgroundColor: palette.charcoal, justifyContent: 'center', alignItems: 'center' },
  note: { ...typography.caption, color: palette.charcoalSoft, marginTop: spacing.lg },
});
