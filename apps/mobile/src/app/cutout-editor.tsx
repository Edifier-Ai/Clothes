import { useLocalSearchParams } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { decodePng, decodeSkImage, encodeAlphaPng, type SkImageT } from '@/native/skiaPngCodec';

import { hitTarget, palette, radius, spacing, typography } from '@/design-system';
import { openAppDb } from '@/core/db/expoDb';
import { appendStroke, listStrokes, nextOrd, popLastStroke, listByGarment } from '@/core/db/queue';
import { getJob } from '@/core/cutout/processor';
import { rebuildDerived } from '@/core/cutout/pipelineCore';
import { makeDeviceIO } from '@/core/cutout/deviceIO';
import { writeMirror } from '@/core/garments/mirror';
import { uuidv7 } from '@/core/id/uuidv7';

type Mode = 'erase' | 'restore';
type Bg = 'checker' | 'solid';
type Tool = 'brush' | 'pan';
interface Pt {
  x: number;
  y: number;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

/** 蒙版 PNG → 单通道 alpha（蒙版为灰度图，R 通道即 alpha；Skia 解码，见 skiaPngCodec）。 */
function decodeMaskPng(b64: string): { alpha: Uint8Array; w: number; h: number } {
  const { rgba, w, h } = decodePng(base64ToBytes(b64));
  const alpha = new Uint8Array(w * h);
  for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4];
  return { alpha, w, h };
}

function encodeMaskPng(alpha: Uint8Array, w: number, h: number): string {
  return bytesToBase64(encodeAlphaPng(alpha, w, h));
}

/** 模块级时间戳助手，避免 react-compiler 把渲染内联 Date.now 视为 impure。 */
function now(): number {
  return Date.now();
}

/**
 * 懒加载 Skia 画布：独立模块（features/cutout/SkiaCanvas）经动态 import 拆 chunk，
 * 启动主 bundle 不加载 Skia 原生模块（历史原因 B-6；现 Skia 2.10 已链接进 APK，
 * 保留懒加载以维持启动包体积与既有行为）。仅当导航到修边页渲染本组件时才加载。
 *
 * 注意：曾在 lazy 回调里内联 require('@shopify/react-native-skia') 并解构出组件，
 * React Compiler 下运行时丢闭包变量（ReferenceError: Property 'Rect' doesn't exist，
 * 2026-08-01 真机实测），故改为标准 React.lazy + 动态 import 静态模块。
 */
const SkiaCanvas = lazy(() => import('@/features/cutout/SkiaCanvas'));

function applyStroke(mask: Uint8Array, w: number, h: number, pts: number[], size: number, op: Mode): void {
  const val = op === 'erase' ? 0 : 255;
  const r = size / 2;
  for (let i = 0; i + 1 < pts.length; i += 2) {
    const x0 = pts[i] * w;
    const y0 = pts[i + 1] * h;
    for (let yy = -r; yy <= r; yy++) {
      for (let xx = -r; xx <= r; xx++) {
        if (xx * xx + yy * yy <= r * r) {
          const px = Math.round(x0 + xx);
          const py = Math.round(y0 + yy);
          if (px >= 0 && px < w && py >= 0 && py < h) mask[py * w + px] = val;
        }
      }
    }
  }
}

/**
 * 修边/审核 IMP-03/IMP-04：Skia 画布显示原图+蒙版（红叠加），对比底色切换，
 * 平移/缩放/笔刷（PanResponder 驱动），擦除/恢复，撤销/重做（mask_strokes 持久），保存重写蒙版。
 * 原图只读，绝不覆盖。
 */
export default function CutoutEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [mode, setMode] = useState<Mode>('erase');
  const [bg, setBg] = useState<Bg>('checker');
  const [tool, setTool] = useState<Tool>('brush');
  const [brush, setBrush] = useState(12);
  const [info, setInfo] = useState('加载中…');
  const [origImg, setOrigImg] = useState<SkImageT | null>(null);
  const maskRef = useRef<Uint8Array | null>(null);
  const [maskW, setMaskW] = useState(0);
  const [maskH, setMaskH] = useState(0);
  const [tick, setTick] = useState(0);
  const strokeRef = useRef<Pt[]>([]);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ w: 360, h: 480 });
  const jobRef = useRef<{ maskRelPath: string; originalRelPath: string } | null>(null);
  const appRef = useRef<Awaited<ReturnType<typeof openAppDb>> | null>(null);
  const rootRef = useRef('');
  const modeRef = useRef(mode);
  const toolRef = useRef(tool);
  const brushRef = useRef(brush);
  const scaleRef = useRef(scale);
  const offsetRef = useRef(offset);
  const sizeRef = useRef(size);
  const maskWHRef = useRef({ w: maskW, h: maskH });
  useEffect(() => {
    modeRef.current = mode;
    toolRef.current = tool;
    brushRef.current = brush;
    scaleRef.current = scale;
    offsetRef.current = offset;
    sizeRef.current = size;
    maskWHRef.current = { w: maskW, h: maskH };
  });

  useEffect(() => {
    void (async () => {
      if (!id) return;
      const app = await openAppDb();
      appRef.current = app;
      const base = FileSystem.documentDirectory?.replace(/\/$/, '') ?? '';
      rootRef.current = `${base}/clothes`;
      const jobs = await listByGarment(app.drizzleDb, id);
      const sj = jobs.find((j) => j.status === 'succeeded') ?? (await getJob(app.drizzleDb, `job-${id}`).catch(() => null));
      if (!sj || !sj.maskRelPath || !sj.originalRelPath) {
        setInfo('无已完成的抠图结果（先在批量导入处理）。');
        return;
      }
      jobRef.current = { maskRelPath: sj.maskRelPath, originalRelPath: sj.originalRelPath };
      const mb64 = await FileSystem.readAsStringAsync(`${rootRef.current}/${sj.maskRelPath}`, { encoding: FileSystem.EncodingType.Base64 });
      const { alpha, w, h } = decodeMaskPng(mb64);
      const strokes = await listStrokes(app.drizzleDb, id);
      for (const s of strokes) applyStroke(alpha, w, h, JSON.parse(s.pointsJson) as number[], s.brushSize, s.op as Mode);
      maskRef.current = alpha;
      setMaskW(w);
      setMaskH(h);
      // 原图经 JSI 解码成 SkImage 传入画布（Skia v2 useImage 对 file:// 真机不可靠）
      const ob64 = await FileSystem.readAsStringAsync(`${rootRef.current}/${sj.originalRelPath}`, { encoding: FileSystem.EncodingType.Base64 });
      setOrigImg(decodeSkImage(base64ToBytes(ob64)));
      setTick((t) => t + 1);
      setInfo(`蒙版 ${w}×${h} · 操作 ${strokes.length}`);
    })();
  }, [id]);

  const screenToImg = (sx: number, sy: number): Pt => {
    const x = (sx - offsetRef.current.x) / scaleRef.current / sizeRef.current.w;
    const y = (sy - offsetRef.current.y) / scaleRef.current / sizeRef.current.h;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  };

  const panRef = useRef<ReturnType<typeof PanResponder.create> | null>(null);
  const panStartRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  useEffect(() => {
    panRef.current = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        if (toolRef.current === 'pan') {
          panStartRef.current = { x: locationX, y: locationY, ox: offsetRef.current.x, oy: offsetRef.current.y };
        } else {
          strokeRef.current = [screenToImg(locationX, locationY)];
        }
      },
      onPanResponderMove: (evt, gs) => {
        if (toolRef.current === 'pan') {
          const s = panStartRef.current;
          if (!s) return;
          setOffset({ x: s.ox + gs.dx, y: s.oy + gs.dy });
          return;
        }
        const p = screenToImg(evt.nativeEvent.locationX, evt.nativeEvent.locationY);
        strokeRef.current.push(p);
        if (maskRef.current) {
          applyStroke(maskRef.current, maskWHRef.current.w, maskWHRef.current.h, [p.x, p.y], brushRef.current, modeRef.current);
          setTick((t) => t + 1);
        }
      },
      onPanResponderRelease: () => {
        if (toolRef.current === 'pan') {
          panStartRef.current = null;
          return;
        }
        const app = appRef.current;
        const gid = id;
        const pts = strokeRef.current.flatMap((p) => [p.x, p.y]);
        strokeRef.current = [];
        if (!app || !gid || pts.length === 0) return;
        void (async () => {
          const ord = await nextOrd(app.drizzleDb, gid);
          await appendStroke(app.drizzleDb, { id: uuidv7(), garmentId: gid, op: modeRef.current, pointsJson: JSON.stringify(pts), brushSize: brushRef.current, ord, createdAt: now() });
          setInfo((s) => s.replace(/ · 操作 \d+/, '') + ` · 操作 ${ord + 1}`);
        })();
      },
    });
  });

  const undo = async () => {
    const app = appRef.current;
    if (!app || !id || !jobRef.current) return;
    const removed = await popLastStroke(app.drizzleDb, id);
    if (removed === null) return;
    const mb64 = await FileSystem.readAsStringAsync(`${rootRef.current}/${jobRef.current.maskRelPath}`, { encoding: FileSystem.EncodingType.Base64 });
    const { alpha, w, h } = decodeMaskPng(mb64);
    const strokes = await listStrokes(app.drizzleDb, id);
    for (const s of strokes) applyStroke(alpha, w, h, JSON.parse(s.pointsJson) as number[], s.brushSize, s.op as Mode);
    maskRef.current = alpha;
    setTick((t) => t + 1);
    setInfo((s) => s.replace(/ · 操作 \d+/, '') + ` · 操作 ${strokes.length}`);
  };

  const save = async () => {
    const app = appRef.current;
    if (!app || !id || !maskRef.current || !jobRef.current) return;
    const b64 = encodeMaskPng(maskRef.current, maskW, maskH);
    const maskAbs = `${rootRef.current}/${jobRef.current.maskRelPath}`;
    const tmp = `${rootRef.current}/_tmp/${id}.edit.mask.png`;
    await FileSystem.makeDirectoryAsync(`${rootRef.current}/_tmp`, { intermediates: true });
    await FileSystem.writeAsStringAsync(tmp, b64, { encoding: FileSystem.EncodingType.Base64 });
    await FileSystem.moveAsync({ from: tmp, to: maskAbs }); // 蒙版可覆盖；原图不动
    // 透明预览/缩略图按新蒙版重建（派生图可重建）；失败不阻塞蒙版保存
    try {
      const ext = jobRef.current.originalRelPath.split('.').pop() ?? 'png';
      await rebuildDerived(makeDeviceIO(rootRef.current), id, ext, 96);
    } catch {
      setInfo('已保存蒙版；预览重建失败，可重进修边页重试');
      return;
    }
    await writeMirror(rootRef.current, app.db, app.drizzleDb, Date.now());
    setInfo('已保存蒙版（原图未动）');
  };

  // 蒙版叠加采样（粗网格，性能）
  const STEP = 6;
  const overlay: Array<{ x: number; y: number; w: number; h: number }> = [];
  if (maskRef.current && maskW > 0) {
    const cw = (size.w * scale) / maskW;
    const ch = (size.h * scale) / maskH;
    for (let my = 0; my < maskH; my += STEP) {
      for (let mx = 0; mx < maskW; mx += STEP) {
        if (maskRef.current[my * maskW + mx] < 128) {
          overlay.push({ x: offset.x + mx * cw, y: offset.y + my * ch, w: cw * STEP + 1, h: ch * STEP + 1 });
        }
      }
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <Pressable accessibilityRole="button" onPress={() => setTool(tool === 'brush' ? 'pan' : 'brush')} style={[styles.chip, tool === 'pan' && styles.chipOn]}>
          <Text style={styles.chipTxt}>{tool === 'brush' ? '笔刷' : '平移'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setMode('erase')} style={[styles.chip, mode === 'erase' && styles.chipOn]}>
          <Text style={styles.chipTxt}>擦除</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setMode('restore')} style={[styles.chip, mode === 'restore' && styles.chipOn]}>
          <Text style={styles.chipTxt}>恢复</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setBg(bg === 'checker' ? 'solid' : 'checker')} style={styles.chip}>
          <Text style={styles.chipTxt}>{bg === 'checker' ? '棋盘底' : '实底'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setScale((s) => Math.max(0.5, +(s - 0.25).toFixed(2)))} style={styles.chip}>
          <Text style={styles.chipTxt}>−</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setScale((s) => Math.min(4, +(s + 0.25).toFixed(2)))} style={styles.chip}>
          <Text style={styles.chipTxt}>＋</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => { setScale(1); setOffset({ x: 0, y: 0 }); }} style={styles.chip}>
          <Text style={styles.chipTxt}>复位</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setBrush((b) => Math.max(4, b - 4))} style={styles.chip}>
          <Text style={styles.chipTxt}>笔-</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setBrush((b) => Math.min(48, b + 4))} style={styles.chip}>
          <Text style={styles.chipTxt}>笔+</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={undo} style={styles.chip}>
          <Text style={styles.chipTxt}>撤销</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={save} style={[styles.chip, styles.saveChip]}>
          <Text style={styles.chipTxt}>保存</Text>
        </Pressable>
      </View>
      <Text style={styles.info}>{info} · 笔 {brush} · ×{scale}</Text>
      <View style={styles.canvasWrap} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} {...(panRef.current?.panHandlers ?? {})}>
        <Suspense fallback={<View style={styles.canvas} />}>
          <SkiaCanvas image={origImg} w={size.w} h={size.h} scale={scale} offset={offset} bg={bg} overlay={overlay} tick={tick} />
        </Suspense>
      </View>
      <Text style={styles.hint}>工具栏切换「平移/笔刷」：平移拖动画面，笔刷拖动改蒙版；＋/− 缩放；撤销回退最近一笔；保存重写蒙版，原图绝不覆盖。</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.paperWhite },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, padding: spacing.sm, backgroundColor: palette.sandSoft },
  chip: { minHeight: hitTarget.min, paddingHorizontal: spacing.sm, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: palette.white, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.hairline },
  chipOn: { backgroundColor: palette.oxblood },
  chipTxt: { ...typography.bodySm, color: palette.charcoal },
  saveChip: { backgroundColor: palette.oxblood },
  info: { ...typography.caption, color: palette.charcoalSoft, paddingHorizontal: spacing.sm },
  canvasWrap: { flex: 1, margin: spacing.sm, borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#eee' },
  canvas: { flex: 1 },
  hint: { ...typography.caption, color: palette.charcoalSoft, padding: spacing.sm },
});
