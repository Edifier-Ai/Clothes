import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector, type GestureStateChangeEvent, type TapGestureHandlerEventPayload } from 'react-native-gesture-handler';

import { hitTarget, palette, radius, spacing, typography } from '@/design-system';
import type { LookDetail } from '@/core/db/dao';
import { clampToCanvas, fitCanvasBox, type CanvasFit, type LookItemGeom } from '@/core/looks/geometry';
import { hitTestCanvasItem } from './canvasHitTest';
import {
  applyOp,
  canRedo,
  canUndo,
  emptyHistory,
  redo,
  undo,
  type History,
  type HistoryOp,
} from '@/core/looks/history';
import { saveLook } from '@/core/looks/lookService';
import { uuidv7 } from '@/core/id/uuidv7';
import { GarmentPicker } from './GarmentPicker';
import { LookComposite } from './LookComposite';
import type { PickCandidate } from './pickFilter';
import { useLookDraft } from './useLookDraft';

export interface CanvasEditorProps {
  candidates: readonly PickCandidate[];
  onSaved: (detail: LookDetail) => void | Promise<void>;
  /** 有未保存改动时上报（路由层据此做退出提示）。 */
  onDirtyChange?: (dirty: boolean) => void;
}

const MIN_SCALE = 0.05;

type GeomPatch = Partial<Pick<LookItemGeom, 'x' | 'y' | 'scale' | 'rotation'>>;

interface DragState {
  id: string;
  base: LookItemGeom;
  patch: GeomPatch;
  /** 同时进行的手势数（pan/pinch/rotation），归零时提交一次 history。 */
  activeCount: number;
}

function sortedItems(items: readonly LookItemGeom[]): LookItemGeom[] {
  return [...items].sort((a, b) => a.zIndex - b.zIndex || a.ord - a.ord);
}

/**
 * 自由画布编辑器（LOK-03）：Skia 渲染 + 点选/拖动/双指缩放旋转 + 层级 + 撤销重做。
 * 坐标全程归一化（geometry.ts），画布尺寸 onLayout 实测；手势期间走 drag 暂态，
 * 结束（所有并指手势 finalize 归零）才提交一次 history，撤销粒度=一次完整手势。
 * 画布模式不自动判定可穿（slot=null），明示给用户。
 */
export function CanvasEditor({ candidates, onSaved, onDirtyChange }: CanvasEditorProps) {
  const [name, setName] = useState('');
  const [items, setItems] = useState<LookItemGeom[]>([]);
  const [history, setHistory] = useState<History>(emptyHistory);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [canvasFit, setCanvasFit] = useState<CanvasFit | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draft = useLookDraft({
    mode: 'canvas',
    name,
    items,
    onRestore: (d) => {
      setName(d.name);
      setItems(d.items.map((it) => ({ ...it, slot: null })));
      setHistory(emptyHistory());
      setSelectedId(null);
    },
  });

  // 未保存改动上报（路由层退出提示用）
  useEffect(() => {
    onDirtyChange?.(items.length > 0 || name.trim() !== '');
  }, [items, name, onDirtyChange]);

  const dragRef = useRef<DragState | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  // 手势回调（JS 线程）始终读最新 items/history，避免闭包过期
  const itemsRef = useRef(items);
  const historyRef = useRef(history);
  const canvasRef = useRef(canvasFit);
  useEffect(() => {
    itemsRef.current = items;
    historyRef.current = history;
    canvasRef.current = canvasFit;
  }, [items, history, canvasFit]);

  const beginGesture = (id: string) => {
    const cur = itemsRef.current.find((it) => it.id === id);
    if (!cur) return;
    if (!dragRef.current || dragRef.current.id !== id) {
      dragRef.current = { id, base: { ...cur }, patch: {}, activeCount: 0 };
    }
    dragRef.current.activeCount += 1;
  };

  const updateGesture = (partial: GeomPatch) => {
    const d = dragRef.current;
    if (!d) return;
    d.patch = { ...d.patch, ...partial };
    setDrag({ ...d, patch: { ...d.patch } });
  };

  const endGesture = () => {
    const d = dragRef.current;
    if (!d) return;
    d.activeCount -= 1;
    if (d.activeCount > 0) return;
    dragRef.current = null;
    setDrag(null);
    if (Object.keys(d.patch).length === 0) return;
    const op: HistoryOp = { type: 'updateGeometry', itemId: d.id, patch: d.patch };
    const r = applyOp(historyRef.current, itemsRef.current, op);
    // 中心点收拢到画布内（允许边角出血，衣物不可被拖到不可达区域）
    setItems(r.items.map((it) => (it.id === d.id ? clampToCanvas(it) : it)));
    setHistory(r.history);
  };

  const makeGestures = (item: LookItemGeom) => {
    const pan = Gesture.Pan()
      .runOnJS(true)
      .onBegin(() => beginGesture(item.id))
      .onUpdate((e) => {
        const c = canvasRef.current;
        const d = dragRef.current;
        if (!c || !d) return;
        updateGesture({
          x: d.base.x + e.translationX / c.w,
          y: d.base.y + e.translationY / c.h,
        });
      })
      .onFinalize(() => endGesture());
    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onBegin(() => beginGesture(item.id))
      .onUpdate((e) => {
        const d = dragRef.current;
        if (!d) return;
        updateGesture({ scale: Math.max(MIN_SCALE, d.base.scale * e.scale) });
      })
      .onFinalize(() => endGesture());
    const rotation = Gesture.Rotation()
      .runOnJS(true)
      .onBegin(() => beginGesture(item.id))
      .onUpdate((e) => {
        const d = dragRef.current;
        if (!d) return;
        updateGesture({ rotation: d.base.rotation + e.rotation });
      })
      .onFinalize(() => endGesture());
    // 点选不在此：衣物级 Tap 会被父级 Pressable 的 onPress(null) 覆盖（缺陷 3），
    // 统一由画布级 canvasTap 坐标命中检测（canvasHitTest）处理。
    return Gesture.Simultaneous(pan, Gesture.Simultaneous(pinch, rotation));
  };

  /** 画布级点选：命中衣物选中（顶层优先），点空白取消选中。坐标先换算进 3:4 画布内。 */
  const onCanvasTapEnd = (e: GestureStateChangeEvent<TapGestureHandlerEventPayload>) => {
    const c = canvasRef.current;
    if (!c) return;
    setSelectedId(hitTestCanvasItem(itemsRef.current, e.x - c.left, e.y - c.top, c, hitTarget.min));
  };
  // eslint-disable-next-line react-hooks/refs -- ref 访问发生在 RNGH 手势回调（事件期），非渲染期
  const canvasTap = Gesture.Tap().runOnJS(true).maxDistance(10).onEnd(onCanvasTapEnd);

  /** 手势期间的暂态合并（渲染用）；history 只认提交后的 items。 */
  const displayItems = useMemo(() => {
    const merged = drag
      ? items.map((it) => (it.id === drag.id ? { ...it, ...drag.patch } : it))
      : items;
    return sortedItems(merged);
  }, [items, drag]);

  const applyHistoryOp = (op: HistoryOp) => {
    const r = applyOp(history, items, op);
    setHistory(r.history);
    setItems(r.items);
  };

  const doUndo = () => {
    const r = undo(history, items);
    setHistory(r.history);
    setItems(r.items);
    if (selectedId && !r.items.some((it) => it.id === selectedId)) setSelectedId(null);
  };

  const doRedo = () => {
    const r = redo(history, items);
    setHistory(r.history);
    setItems(r.items);
    if (selectedId && !r.items.some((it) => it.id === selectedId)) setSelectedId(null);
  };

  const addItem = (c: PickCandidate) => {
    const item: LookItemGeom = {
      id: uuidv7(),
      garmentId: c.id,
      slot: null,
      x: 0.5,
      y: 0.5,
      scale: 0.4,
      rotation: 0,
      zIndex: items.length,
      ord: 0,
    };
    applyHistoryOp({ type: 'addItem', item });
    setSelectedId(item.id);
    setPickerOpen(false);
  };

  const selected = selectedId ? items.find((it) => it.id === selectedId) : undefined;

  const save = async () => {
    if (items.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const detail = await saveLook({
        name: name.trim() || '未命名造型',
        mode: 'canvas',
        items: items.map((it) => ({ ...it, slot: null })),
      });
      await draft.markSaved();
      await onSaved(detail);
    } catch {
      setError('保存失败，请重试');
      setBusy(false);
    }
  };

  const onCanvasLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    // 可用框内嵌入 3:4 规范画布（居中留白）；几何/触控/封面全用同一比例，杜绝裁切
    if (width > 0 && height > 0) setCanvasFit(fitCanvasBox(width, height));
  };

  const selectedIds = useMemo(() => new Set(items.map((it) => it.garmentId)), [items]);

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

      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canUndo(history) }}
          disabled={!canUndo(history)}
          onPress={doUndo}
          style={styles.topBtn}
        >
          <Text style={[styles.topBtnLabel, !canUndo(history) && styles.topBtnDisabled]}>撤销</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canRedo(history) }}
          disabled={!canRedo(history)}
          onPress={doRedo}
          style={styles.topBtn}
        >
          <Text style={[styles.topBtnLabel, !canRedo(history) && styles.topBtnDisabled]}>重做</Text>
        </Pressable>
        <View style={styles.topSpacer} />
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: items.length === 0 || busy, busy }}
          disabled={items.length === 0 || busy}
          onPress={save}
          style={[styles.saveBtn, (items.length === 0 || busy) && styles.saveBtnDisabled]}
        >
          {busy ? <ActivityIndicator color={palette.white} /> : <Text style={styles.saveLabel}>保存造型</Text>}
        </Pressable>
      </View>

      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="未命名造型"
        placeholderTextColor={palette.charcoalSoft}
        style={styles.nameInput}
        accessibilityLabel="造型名称"
      />

      <GestureDetector gesture={canvasTap}>
        <View style={styles.canvasWrap}>
          <View style={styles.canvasInner} onLayout={onCanvasLayout}>
          {canvasFit && canvasFit.w > 0 ? (
            <View
              style={[
                styles.canvasFitted,
                { left: canvasFit.left, top: canvasFit.top, width: canvasFit.w, height: canvasFit.h },
              ]}
            >
              <LookComposite
                items={displayItems.map((it) => ({
                  id: it.id,
                  imageRelPath: candidates.find((c) => c.id === it.garmentId)?.imageRelPath ?? null,
                  x: it.x,
                  y: it.y,
                  scale: it.scale,
                  rotation: it.rotation,
                }))}
                width={canvasFit.w}
                height={canvasFit.h}
                selectedId={selectedId}
              />
              {/* eslint-disable-next-line react-hooks/refs -- makeGestures 的 ref 访问发生在 RNGH 手势回调（事件期），非渲染期 */}
              {displayItems.map((it) => {
                const w = Math.max(it.scale * canvasFit.w, hitTarget.min);
                const cx = it.x * canvasFit.w;
                const cy = it.y * canvasFit.h;
                return (
                  <GestureDetector key={it.id} gesture={makeGestures(it)}>
                    <View
                      style={[
                        styles.touchBox,
                        { left: cx - w / 2, top: cy - w / 2, width: w, height: w },
                      ]}
                    />
                  </GestureDetector>
                );
              })}
            </View>
          ) : null}
          </View>
        </View>
      </GestureDetector>

      {selected ? (
        <View style={styles.toolBar}>
          {(
            [
              ['前移', { type: 'reorder', itemId: selected.id, direction: 'forward' } as HistoryOp],
              ['后移', { type: 'reorder', itemId: selected.id, direction: 'backward' } as HistoryOp],
              ['置顶', { type: 'reorder', itemId: selected.id, direction: 'front' } as HistoryOp],
              ['置底', { type: 'reorder', itemId: selected.id, direction: 'back' } as HistoryOp],
            ] as const
          ).map(([label, op]) => (
            <Pressable key={label} accessibilityRole="button" onPress={() => applyHistoryOp(op)} style={styles.toolBtn}>
              <Text style={styles.toolBtnLabel}>{label}</Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              applyHistoryOp({ type: 'removeItem', itemId: selected.id });
              setSelectedId(null);
            }}
            style={styles.toolBtn}
          >
            <Text style={[styles.toolBtnLabel, { color: palette.danger }]}>删除</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.canvasHint}>自由画布不自动判定可穿：任意摆放、缩放、旋转与分层。</Text>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {pickerOpen ? (
        <GarmentPicker
          candidates={candidates}
          slot={null}
          selectedIds={selectedIds}
          onPick={addItem}
          onClose={() => setPickerOpen(false)}
        />
      ) : (
        <View style={styles.bottomBar}>
          <Pressable accessibilityRole="button" onPress={() => setPickerOpen(true)} style={styles.addBtn}>
            <Text style={styles.addBtnLabel}>添加单品 ＋</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.paperWhite },
  draftBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    padding: spacing.sm,
    backgroundColor: palette.sandSoft,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
  },
  draftText: { ...typography.bodySm, color: palette.charcoal, flex: 1 },
  draftBtn: { minHeight: hitTarget.min, justifyContent: 'center', paddingHorizontal: spacing.xs },
  draftBtnLabel: { ...typography.bodySm, color: palette.oxblood },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    gap: spacing.xs,
  },
  topBtn: { minHeight: hitTarget.min, minWidth: hitTarget.min, justifyContent: 'center', alignItems: 'center' },
  topBtnLabel: { ...typography.bodySm, color: palette.oxblood },
  topBtnDisabled: { color: palette.hairline },
  topSpacer: { flex: 1 },
  saveBtn: {
    minHeight: hitTarget.min,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: palette.oxblood,
    justifyContent: 'center',
  },
  saveBtnDisabled: { backgroundColor: palette.hairline },
  saveLabel: { ...typography.bodySm, color: palette.white },
  nameInput: {
    ...typography.bodySm,
    color: palette.charcoal,
    backgroundColor: palette.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    minHeight: hitTarget.min,
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
  },
  canvasWrap: { flex: 1, margin: spacing.md },
  canvasInner: { flex: 1 },
  canvasFitted: {
    position: 'absolute',
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
  },
  touchBox: { position: 'absolute' },
  toolBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.hairline,
    paddingVertical: spacing.xxs,
  },
  toolBtn: { minHeight: hitTarget.min, minWidth: hitTarget.min, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xs },
  toolBtnLabel: { ...typography.bodySm, color: palette.charcoal },
  canvasHint: {
    ...typography.caption,
    color: palette.charcoalSoft,
    textAlign: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.hairline,
  },
  errorText: { ...typography.bodySm, color: palette.danger, textAlign: 'center' },
  bottomBar: { padding: spacing.md, paddingTop: spacing.xs },
  addBtn: {
    minHeight: hitTarget.preferred,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: palette.sandSoft,
  },
  addBtnLabel: { ...typography.body, color: palette.oxblood },
});
