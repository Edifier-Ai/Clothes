import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { palette, spacing, typography } from '@/design-system';
import { runSegmentationProbe, type ProbeResult } from '@/native/segmentationProbe';

/**
 * 端侧 ONNX 探针基准页（MVP-002）。无模型/无解码器时如实显示 unavailable + 原因，
 * 不伪造延迟。模型与图像解码器就位后，本页输出 p50/p95/峰值内存/模型哈希。
 */
export default function SegmentationBenchmarkScreen() {
  const [result, setResult] = useState<ProbeResult | null>(null);

  useEffect(() => {
    void runSegmentationProbe({
      // 占位路径：模型/图片未随包提供时探针返回 available=false + reason（符合「不伪造」）。
      modelPath: '/data/local/tmp/__no_model__.onnx',
      imagePath: '/data/local/tmp/__no_image__.png',
      inputHW: [320, 320],
      runs: 12,
    }).then(setResult);
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>端侧抠图探针</Text>
      {result === null ? (
        <Text style={styles.line}>运行中…</Text>
      ) : (
        <>
          <Text style={styles.line}>available: {String(result.available)}</Text>
          {result.reason ? <Text style={styles.reason}>{result.reason}</Text> : null}
          <Text style={styles.line}>modelBytes: {result.modelBytes}</Text>
          <Text style={styles.line}>modelHash: {result.modelHash || '—'}</Text>
          <Text style={styles.line}>loadMs: {fmt(result.loadMs)}</Text>
          <Text style={styles.line}>p50Ms: {fmt(result.p50Ms)}</Text>
          <Text style={styles.line}>p95Ms: {fmt(result.p95Ms)}</Text>
          <Text style={styles.line}>peakHeapMb: {fmt(result.peakHeapMb)}</Text>
          <Text style={styles.line}>outputMaskBytes: {result.outputMaskBytes ?? '—'}</Text>
          <Text style={styles.note}>
            模型/解码器就位后此处显示真机延迟；当前为探针可用性自检（无模型即标 unavailable，不伪造）。
          </Text>
        </>
      )}
    </ScrollView>
  );
}

function fmt(n: number | null): string {
  return n === null ? '—' : n.toFixed(1);
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, backgroundColor: palette.paperWhite },
  title: { ...typography.title, color: palette.charcoal, marginBottom: spacing.md },
  line: { ...typography.bodySm, color: palette.charcoal, fontFamily: 'monospace' },
  reason: { ...typography.bodySm, color: palette.oxblood, marginVertical: spacing.xs },
  note: { ...typography.caption, color: palette.charcoalSoft, marginTop: spacing.md },
});
