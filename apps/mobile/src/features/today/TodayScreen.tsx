import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useCallback, useEffect, useState, type PropsWithChildren } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';

import { palette, radius, spacing, typography, hitTarget } from '@/design-system';
import { EmptyStateCard } from '@/features/shell/EmptyStateCard';
import { TabShell } from '@/features/shell/TabShell';
import { GarmentArtwork } from '@/features/shared/GarmentArtwork';
import { openAppDb } from '@/core/db/expoDb';
import {
  listActiveGarmentsWithThumbs,
  type WardrobeListItem,
} from '@/core/db/dao';
import { originalUri } from '@/core/files/uri';
import { writeMirror } from '@/core/garments/mirror';
import { applyPostWear, getGarmentDetail, type PostWearAction } from '@/core/garments/service';
import {
  generateRecommendation,
  DEFAULT_RECOMMENDATION_FACTORS,
  REASON_LABEL,
  TEMP_BANDS,
  TEMP_LABEL,
  defaultBandForMonth,
  topReasons,
  type GarmentForRec,
  type Outfit,
  type RecResult,
  type RecommendationFactors,
  type TempBand,
} from '@/core/recommend';
import { getAppPreferences, subscribeAppPreferences } from '@/core/preferences';
import { getWearStats, recordWear } from '@/core/recommend/wearLog';
import {
  buildFeedbackWeights,
  listFeedback,
  recordFeedback,
  type FeedbackInput,
} from '@/core/recommend/feedback';
import {
  listReplacementCandidates,
  outfitSignature,
  regenerateOutfit,
  replaceSlot,
  type OutfitSlot as RecommendationSlot,
  type RecommendationMode,
} from '@/core/recommend/replacement';
import type { GarmentTagRow } from '@/core/db/schema';

const CATEGORY_LABEL: Record<string, string> = {
  top: '上装',
  bottom: '下装',
  dress: '连衣裙',
  shoes: '鞋',
  outerwear: '外套',
  accessory: '配饰',
  other: '衣物',
};

/** Today 专用展示字段；推荐核心仍只依赖 GarmentForRec，不污染规则层类型。 */
export type TodayGarment = GarmentForRec & {
  displayName: string;
  imageRelPath: string | null;
};

interface TodayWearStat {
  lastWornAt: number | null;
  timesWorn: number;
}

/** 可注入的数据源让装配逻辑在不触碰设备 SQLite 的情况下被完整验证。 */
export interface TodayItemLoadSource {
  listGarmentsWithImages: () => Promise<WardrobeListItem[]>;
  loadWearStats: () => Promise<ReadonlyMap<string, TodayWearStat>>;
  loadTags: () => Promise<Pick<GarmentTagRow, 'garmentId' | 'kind' | 'value'>[]>;
}

/**
 * 今日页加载器：真实衣物名 + 最佳展示图（抠图缩略图/预览优先，原图兜底）
 * + wear stats + 颜色标签。读取失败向上抛出，由页面展示可重试错误态，绝不冒充空衣橱。
 */
export async function loadTodayItems(source?: TodayItemLoadSource): Promise<TodayGarment[]> {
  let resolved = source;
  if (!resolved) {
    const app = await openAppDb();
    resolved = {
      listGarmentsWithImages: () => listActiveGarmentsWithThumbs(app.db, app.drizzleDb),
      loadWearStats: () => getWearStats(app.drizzleDb),
      loadTags: () => app.db.getAllTags(),
    };
  }

  const [entries, stats, allTags] = await Promise.all([
    resolved.listGarmentsWithImages(),
    resolved.loadWearStats(),
    resolved.loadTags(),
  ]);
  const colorByGarment = new Map<string, string>();
  const seasonByGarment = new Map<string, string>();
  for (const tag of allTags) {
    if (tag.kind === 'color' && !colorByGarment.has(tag.garmentId)) {
      colorByGarment.set(tag.garmentId, tag.value);
    }
    if (tag.kind === 'season' && !seasonByGarment.has(tag.garmentId)) {
      seasonByGarment.set(tag.garmentId, tag.value);
    }
  }

  return entries.map(({ garment, imageRelPath }) => ({
    id: garment.id,
    category: garment.category as GarmentForRec['category'],
    status: garment.status as GarmentForRec['status'],
    createdAt: garment.createdAt,
    updatedAt: garment.updatedAt,
    lastWornAt: stats.get(garment.id)?.lastWornAt ?? null,
    timesWorn: stats.get(garment.id)?.timesWorn ?? 0,
    archivedAt: garment.archivedAt,
    color: colorByGarment.get(garment.id) ?? null,
    season: seasonByGarment.get(garment.id) ?? null,
    displayName: garment.name.trim() || CATEGORY_LABEL[garment.category] || '未命名衣物',
    imageRelPath,
  }));
}

interface TodayScreenProps {
  /** 测试或预览注入；默认走 loadTodayItems。 */
  loadItems?: () => Promise<GarmentForRec[]>;
  /** 提交记录的可注入实现；默认走 recordWear + writeMirror。 */
  onSubmit?: (input: SubmitInput) => Promise<{ inserted: boolean }>;
  /** 推荐反馈可注入实现；默认写 feedback_events + 镜像。 */
  onFeedback?: (input: FeedbackInput) => Promise<{ inserted: boolean }>;
  /** 反馈软权重加载器。 */
  loadFeedbackWeights?: () => Promise<Map<string, number>>;
  /** 推荐参考要素加载器；默认读取本机设置。 */
  loadRecommendationFactors?: () => Promise<RecommendationFactors>;
  /** 默认场景（首次加载即用）；用户可改。 */
  defaultOccasion?: 'commute' | 'casual' | 'formal' | 'travel' | 'sport';
  now?: number;
}

export interface SubmitInput {
  recommendationId: string;
  date: string;
  outfit: Outfit;
  occasion: string;
  comfort: 'good' | 'ok' | 'bad';
  now: number;
}

type ViewState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'empty' }
  | { kind: 'ready'; result: RecResult; outfit: Outfit | null }
  | { kind: 'recording'; result: RecResult; outfit: Outfit; occasion: string; comfort: 'good' | 'ok' | 'bad' }
  | { kind: 'submitted'; result: RecResult; outfit: Outfit; inserted: boolean };

type PanelState =
  | { kind: 'none' }
  | { kind: 'replace'; slot: RecommendationSlot; candidates: GarmentForRec[] }
  | { kind: 'regenerate'; preview: Outfit | null; skipReason: string; lockHero: boolean }
  | { kind: 'mode'; selected: RecommendationMode };

function garmentDisplayName(garment: GarmentForRec): string {
  const displayName = (garment as Partial<TodayGarment>).displayName;
  return typeof displayName === 'string' && displayName.trim()
    ? displayName.trim()
    : CATEGORY_LABEL[garment.category] ?? '衣物';
}

function garmentImageRelPath(garment: GarmentForRec): string | null {
  const relPath = (garment as Partial<TodayGarment>).imageRelPath;
  return typeof relPath === 'string' && relPath.trim() ? relPath.trim() : null;
}

/** 只接受 App 私有目录相对路径，拒绝协议、绝对路径、回退段和控制字符。 */
export function safeTodayImageUri(relPath: string | null): string | null {
  if (
    !relPath ||
    relPath.length > 1024 ||
    /^[a-z][a-z0-9+.-]*:/i.test(relPath) ||
    /^[\\/]/.test(relPath) ||
    /(^|[\\/])\.\.([\\/]|$)/.test(relPath) ||
    /[\u0000-\u001f\u007f]/.test(relPath)
  ) {
    return null;
  }
  return originalUri(relPath.replace(/\\/g, '/'));
}

/** TDY-07 穿后洗护面板（内存态）：记录穿着成功后逐件选择洗护动作。 */
interface PostWearEntry {
  garmentId: string;
  slotLabel: string;
  name: string;
}

interface PostWearPanelState {
  entries: PostWearEntry[];
  decisions: Record<string, PostWearAction>;
  busy: boolean;
  error: string | null;
}

async function loadStoredFeedbackWeights(): Promise<Map<string, number>> {
  const app = await openAppDb();
  return buildFeedbackWeights(await listFeedback(app.drizzleDb));
}

async function loadStoredRecommendationFactors(): Promise<RecommendationFactors> {
  return (await getAppPreferences()).recommendationFactors;
}

function recentItemIds(items: readonly GarmentForRec[], now: number): string[] {
  const recentBoundary = now - 7 * 86_400_000;
  return items
    .filter((item) => item.lastWornAt != null && item.lastWornAt >= recentBoundary)
    .map((item) => item.id);
}

async function saveFeedback(input: FeedbackInput): Promise<{ inserted: boolean }> {
  const app = await openAppDb();
  const result = await recordFeedback(app.drizzleDb, input);
  const root = `${FileSystem.documentDirectory?.replace(/\/$/, '') ?? '/tmp'}/clothes`;
  await writeMirror(root, app.db, app.drizzleDb, input.createdAt);
  return result;
}

const OCCASIONS: { value: SubmitInput['comfort'] extends never ? never : 'commute' | 'casual' | 'formal' | 'travel' | 'sport'; label: string }[] = [
  { value: 'commute', label: '通勤' },
  { value: 'casual', label: '日常' },
  { value: 'formal', label: '正式' },
  { value: 'travel', label: '旅行' },
  { value: 'sport', label: '运动' },
];

const COMFORTS: { value: 'good' | 'ok' | 'bad'; label: string }[] = [
  { value: 'good', label: '舒适' },
  { value: 'ok', label: '还行' },
  { value: 'bad', label: '不适' },
];

function formatDate(now: number): string {
  return new Date(now).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
}

function ymd(now: number): string {
  const d = new Date(now);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 今日页（MVP-005/006/DEMO-001）：推荐、换一件、换一套、模式与反馈。 */
export default function TodayScreen({
  loadItems = loadTodayItems,
  onSubmit,
  onFeedback,
  loadFeedbackWeights = loadStoredFeedbackWeights,
  loadRecommendationFactors = loadStoredRecommendationFactors,
  defaultOccasion = 'commute',
  now,
}: TodayScreenProps) {
  const router = useRouter();
  const [nowVal] = useState(() => now ?? Date.now());
  const [state, setState] = useState<ViewState>({ kind: 'loading' });
  const [occasion, setOccasion] = useState<string>(defaultOccasion);
  /** 今日气温：默认按月份估计，用户点选后覆盖；「天气」要素关闭时不参与推荐。 */
  const [temperature, setTemperature] = useState<TempBand>(() => defaultBandForMonth(new Date(now ?? Date.now())));
  const [items, setItems] = useState<GarmentForRec[]>([]);
  const [mode, setMode] = useState<RecommendationMode>('safe');
  const [panel, setPanel] = useState<PanelState>({ kind: 'none' });
  const [feedbackWeights, setFeedbackWeights] = useState<Map<string, number>>(new Map());
  const [factors, setFactors] = useState<RecommendationFactors>({
    ...DEFAULT_RECOMMENDATION_FACTORS,
  });
  const [avoidedSignatures, setAvoidedSignatures] = useState<string[]>([]);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [postWear, setPostWear] = useState<PostWearPanelState | null>(null);

  const recContext = useCallback(
    () => ({
      now: nowVal,
      occasion: occasion as 'commute' | 'casual' | 'formal' | 'travel' | 'sport',
      recentItemIds: recentItemIds(items, nowVal),
      factors,
      temperature,
    }),
    [factors, items, nowVal, occasion, temperature],
  );

  const refresh = useCallback(async () => {
    setState({ kind: 'loading' });
    setPanel({ kind: 'none' });
    setPostWear(null);
    try {
      const [loadedItems, weights, loadedFactors] = await Promise.all([
        loadItems(),
        loadFeedbackWeights().catch(() => new Map<string, number>()),
        loadRecommendationFactors().catch(() => ({ ...DEFAULT_RECOMMENDATION_FACTORS })),
      ]);
      setItems(loadedItems);
      setFeedbackWeights(weights);
      setFactors(loadedFactors);
      if (loadedItems.length === 0) {
        setState({ kind: 'empty' });
        return;
      }
      const result = generateRecommendation(loadedItems, {
        now: nowVal,
        occasion: occasion as 'commute' | 'casual' | 'formal' | 'travel' | 'sport',
        recentItemIds: recentItemIds(loadedItems, nowVal),
        factors: loadedFactors,
        temperature,
      });
      if (result.ok) {
        setState({ kind: 'ready', result, outfit: result.outfit });
      } else {
        setState({ kind: 'ready', result, outfit: null });
      }
    } catch {
      setState({
        kind: 'error',
        message: '衣橱数据没有加载成功。你的衣物仍保存在本机，请重试。',
      });
    }
  }, [loadFeedbackWeights, loadItems, loadRecommendationFactors, occasion, nowVal, temperature]);

  useEffect(() => {
    // refresh 内部 setState 在 await 之后（异步回调里），非 effect 同步 setState。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().catch(() => {
      /* refresh 自身已把读取失败收敛为可重试 error 状态。 */
    });
  }, [refresh]);

  useEffect(
    () => subscribeAppPreferences((preferences) => setFactors(preferences.recommendationFactors)),
    [],
  );

  /** TDY-07：记录穿着成功后打开穿后洗护面板；详情读取失败也不暴露内部 id。 */
  const openPostWearPanel = useCallback((worn: Outfit) => {
    const slots: { slot: RecommendationSlot; garment: GarmentForRec }[] = [
      { slot: 'top', garment: worn.top },
      { slot: 'bottom', garment: worn.bottom },
      { slot: 'shoes', garment: worn.shoes },
      ...(worn.outerwear ? [{ slot: 'outerwear' as RecommendationSlot, garment: worn.outerwear }] : []),
    ];
    void Promise.all(
      slots.map(async ({ slot, garment }): Promise<PostWearEntry> => {
        const detail = await getGarmentDetail(garment.id).catch(() => null);
        return {
          garmentId: garment.id,
          slotLabel: SLOT_LABEL[slot],
          name: detail?.garment.name?.trim() || garmentDisplayName(garment),
        };
      }),
    ).then((entries) => {
      const decisions: Record<string, PostWearAction> = {};
      for (const entry of entries) decisions[entry.garmentId] = 'skip';
      setPostWear({ entries, decisions, busy: false, error: null });
    });
  }, []);

  const choosePostWearAction = useCallback((garmentId: string, action: PostWearAction) => {
    setPostWear((prev) =>
      prev ? { ...prev, decisions: { ...prev.decisions, [garmentId]: action }, error: null } : prev,
    );
  }, []);

  const submitPostWear = useCallback(async () => {
    if (!postWear || postWear.busy) return;
    setPostWear({ ...postWear, busy: true, error: null });
    try {
      await applyPostWear(
        postWear.entries.map((entry) => ({
          garmentId: entry.garmentId,
          action: postWear.decisions[entry.garmentId] ?? 'skip',
        })),
      );
      setPostWear(null);
    } catch {
      // 失败保留面板可重试（任务卡要求）
      setPostWear((prev) =>
        prev ? { ...prev, busy: false, error: '洗护状态未保存，可在详情页手动更新' } : prev,
      );
    }
  }, [postWear]);

  const handleSubmit = useCallback(
    async (outfit: Outfit, occ: string, comfort: 'good' | 'ok' | 'bad') => {
      const recId = `rec-${ymd(nowVal)}-${occasion}`;
      const date = ymd(nowVal);
      const input: SubmitInput = { recommendationId: recId, date, outfit, occasion: occ, comfort, now: nowVal };
      const feedbackInput: FeedbackInput = {
        idempotencyKey: `${recId}:accept:${outfitSignature(outfit)}`,
        recommendationId: recId,
        eventType: 'accept',
        slot: null,
        beforeItemId: null,
        afterItemId: outfit.top.id,
        skipReason: null,
        mode,
        createdAt: nowVal,
      };
      try {
        await (onFeedback ?? saveFeedback)(feedbackInput);
        setFeedbackError(null);
      } catch {
        setFeedbackError('接受反馈未保存；穿着记录仍可继续，稍后可重试');
      }
      try {
        if (onSubmit) {
          const r = await onSubmit(input);
          setState((prev) =>
            prev.kind === 'recording' ? { kind: 'submitted', result: prev.result, outfit: prev.outfit, inserted: r.inserted } : prev,
          );
          if (r.inserted) openPostWearPanel(outfit);
        } else {
          const app = await openAppDb();
          // 幂等检查 + wear_logs + wear_log_items 必须原子写入，避免只留下半条记录。
          const r = await app.withTransaction(() =>
            recordWear(app.drizzleDb, {
              recommendationId: input.recommendationId,
              date: input.date,
              outfit: input.outfit,
              occasion: input.occasion,
              comfort: input.comfort,
              now: input.now,
            }),
          );
          // 写持久镜像（B-4 兜底）
          const root = `${FileSystem.documentDirectory?.replace(/\/$/, '') ?? '/tmp'}/clothes`;
          await writeMirror(root, app.db, app.drizzleDb, nowVal);
          setState((prev) =>
            prev.kind === 'recording' ? { kind: 'submitted', result: prev.result, outfit: prev.outfit, inserted: r.inserted } : prev,
          );
          if (r.inserted) openPostWearPanel(outfit);
        }
      } catch {
        // 失败保留当前搭配和填写内容，允许幂等重试（任务卡要求）
        setState((prev) =>
          prev.kind === 'recording' ? { kind: 'submitted', result: prev.result, outfit: prev.outfit, inserted: false } : prev,
        );
      }
    },
    [mode, nowVal, occasion, onFeedback, onSubmit, openPostWearPanel],
  );

  const persistFeedback = useCallback(
    async (input: FeedbackInput) => {
      try {
        await (onFeedback ?? saveFeedback)(input);
        setFeedbackError(null);
        const next = new Map(feedbackWeights);
        if (input.beforeItemId) next.set(input.beforeItemId, (next.get(input.beforeItemId) ?? 0) - 2);
        if (input.afterItemId) next.set(input.afterItemId, (next.get(input.afterItemId) ?? 0) + 2);
        setFeedbackWeights(next);
      } catch {
        setFeedbackError('反馈未保存，请重试；当前搭配已保留');
      }
    },
    [feedbackWeights, onFeedback],
  );

  const openReplace = useCallback(
    (slot: RecommendationSlot, outfit: Outfit) => {
      const candidates = listReplacementCandidates(outfit, slot, items, recContext(), {
        mode,
        feedbackWeights,
        factors,
      });
      setPanel({ kind: 'replace', slot, candidates });
    },
    [factors, feedbackWeights, items, mode, recContext],
  );

  const chooseReplacement = useCallback(
    (outfit: Outfit, slot: RecommendationSlot, candidate: GarmentForRec, result: RecResult) => {
      const before = outfit[slot];
      if (!before) return;
      const next = replaceSlot(outfit, slot, candidate);
      const nextResult: RecResult = result.ok
        ? { ...result, outfit: next, reasonCodes: [...result.reasonCodes, 'SLOT_REPLACED'] }
        : { ok: true, outfit: next, reasonCodes: ['SLOT_REPLACED'], totalScore: 0 };
      setState({ kind: 'ready', result: nextResult, outfit: next });
      setPanel({ kind: 'none' });
      const recId = `rec-${ymd(nowVal)}-${occasion}`;
      void persistFeedback({
        idempotencyKey: `${recId}:replace:${slot}:${before.id}:${candidate.id}`,
        recommendationId: recId,
        eventType: 'replace',
        slot,
        beforeItemId: before.id,
        afterItemId: candidate.id,
        skipReason: null,
        mode,
        createdAt: nowVal,
      });
    },
    [mode, nowVal, occasion, persistFeedback],
  );

  const makeRegeneration = useCallback(
    (outfit: Outfit, lockHero: boolean): Outfit | null => {
      const result = regenerateOutfit(items, recContext(), {
        mode,
        avoidSignatures: [...avoidedSignatures, outfitSignature(outfit)],
        lockedHeroId: lockHero ? outfit.top.id : null,
        feedbackWeights,
        factors,
      });
      return result.ok ? result.outfit : null;
    },
    [avoidedSignatures, factors, feedbackWeights, items, mode, recContext],
  );

  const acceptRegeneration = useCallback(
    (current: Outfit, preview: Outfit, skipReason: string) => {
      const result = regenerateOutfit(items, recContext(), {
        mode,
        avoidSignatures: [...avoidedSignatures, outfitSignature(current)],
        feedbackWeights,
        factors,
      });
      const nextResult: RecResult = result.ok
        ? { ...result, outfit: preview }
        : { ok: true, outfit: preview, reasonCodes: ['REPEAT_SUPPRESSION'], totalScore: 0 };
      setAvoidedSignatures((previous) => [...previous, outfitSignature(current)]);
      setState({ kind: 'ready', result: nextResult, outfit: preview });
      setPanel({ kind: 'none' });
      const recId = `rec-${ymd(nowVal)}-${occasion}`;
      void persistFeedback({
        idempotencyKey: `${recId}:skip:${outfitSignature(current)}:${skipReason || 'none'}`,
        recommendationId: recId,
        eventType: 'skip',
        slot: null,
        beforeItemId: current.top.id,
        afterItemId: preview.top.id,
        skipReason: skipReason || null,
        mode,
        createdAt: nowVal,
      });
    },
    [avoidedSignatures, factors, feedbackWeights, items, mode, nowVal, occasion, persistFeedback, recContext],
  );

  const applyMode = useCallback(
    (selected: RecommendationMode, current: Outfit) => {
      const result = regenerateOutfit(items, recContext(), {
        mode: selected,
        avoidSignatures: [],
        lockedHeroId: selected === 'hero' && factors.heroItem ? current.top.id : null,
        feedbackWeights,
        factors,
      });
      setMode(selected);
      if (result.ok) setState({ kind: 'ready', result, outfit: result.outfit });
      setPanel({ kind: 'none' });
      const recId = `rec-${ymd(nowVal)}-${occasion}`;
      void persistFeedback({
        idempotencyKey: `${recId}:mode:${selected}`,
        recommendationId: recId,
        eventType: 'mode',
        slot: null,
        beforeItemId: null,
        afterItemId: selected === 'hero' ? current.top.id : null,
        skipReason: null,
        mode: selected,
        createdAt: nowVal,
      });
    },
    [factors, feedbackWeights, items, nowVal, occasion, persistFeedback, recContext],
  );

  const today = formatDate(nowVal);

  return (
    <TabShell
      title="今天"
      subtitle={today}
      trailing={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="打开设置"
          hitSlop={8}
          onPress={() => router.push('/settings')}
          style={styles.settingsButton}
        >
          <Ionicons name="settings-outline" size={22} color={palette.charcoal} />
        </Pressable>
      }
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        {feedbackError ? <Text style={styles.errorText}>{feedbackError}</Text> : null}
        {state.kind === 'loading' && (
          <View style={styles.stage}>
            <Text style={styles.stageLabel}>加载今日搭配…</Text>
          </View>
        )}

        {state.kind === 'error' && (
          <View accessibilityRole="alert" style={styles.stateSection}>
            <Text style={styles.stageNumber}>!</Text>
            <Text style={styles.stateTitle}>今日搭配加载失败</Text>
            <Text style={styles.stateDescription}>{state.message}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="重新加载今日搭配"
              onPress={() => void refresh()}
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
            >
              <Text style={styles.primaryBtnLabel}>重新加载</Text>
            </Pressable>
          </View>
        )}

        {state.kind === 'empty' && (
          <>
            <View style={styles.stage}>
              <Text style={styles.stageNumber}>—</Text>
              <Text style={styles.stageLabel}>尚无今日搭配</Text>
            </View>
            <EmptyStateCard
              eyebrow="01"
              title="先整理 12 件常穿衣物"
              description="录入 6 件即可预览第一套搭配，录满 12 件解锁可解释推荐。照片默认保存在本机并在手机本地抠图；仅在你明确同意使用腾讯云抠图时，所选照片才会上传处理，原图不会被覆盖。"
              actionLabel="开始整理衣橱"
              actionHint="批量选照片，手机本地自动抠图"
              onAction={() => router.push('/batch-import')}
            />
          </>
        )}

        {state.kind === 'ready' && state.outfit == null && !state.result.ok && (
          <EmptyStateCard
            eyebrow="02"
            title="衣橱还差几件"
            description={`缺槽位：${state.result.missing.map((slot) => CATEGORY_LABEL[slot] ?? slot).join('、')}。补录后即可生成今日搭配。`}
            actionLabel="去衣橱补录"
            actionHint="补齐后回到此页自动生成"
          />
        )}

        {state.kind === 'ready' && state.outfit && (() => {
          const outfit: Outfit = state.outfit!;
          return (
          <OutfitCard
            outfit={outfit}
            reasonCodes={state.result.ok ? state.result.reasonCodes : []}
            occasion={occasion}
            onChangeOccasion={setOccasion}
            temperature={factors.weather ? temperature : null}
            onChangeTemperature={setTemperature}
            mode={mode}
            onReplace={(slot) => openReplace(slot, outfit)}
            onRegenerate={() =>
              setPanel({
                kind: 'regenerate',
                preview: makeRegeneration(outfit, false),
                skipReason: '',
                lockHero: false,
              })
            }
            onMode={() => setPanel({ kind: 'mode', selected: mode })}
            onWearThis={() =>
              setState({ kind: 'recording', result: state.result, outfit, occasion, comfort: 'good' })
            }
          />
          );
        })()}

        {state.kind === 'submitted' && state.outfit && (
          <View style={styles.stage}>
            <Text style={styles.stageNumber}>{state.inserted ? '✓' : '—'}</Text>
            <Text style={styles.stageLabel}>
              {state.inserted ? '已记录今日穿着' : '本次未保存（可重试）'}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => refresh()}
              style={styles.linkBtn}
            >
              <Text style={styles.linkBtnLabel}>查看下一套</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {state.kind === 'ready' && state.outfit && panel.kind === 'replace' && (
        <ActionModal title={`只换${SLOT_LABEL[panel.slot]}`} onClose={() => setPanel({ kind: 'none' })}>
          <ReplacementPanel
            slot={panel.slot}
            candidates={panel.candidates}
            onChoose={(candidate) => chooseReplacement(state.outfit!, panel.slot, candidate, state.result)}
            onClose={() => setPanel({ kind: 'none' })}
          />
        </ActionModal>
      )}

      {state.kind === 'ready' && state.outfit && panel.kind === 'regenerate' && (
        <ActionModal title="换一套" onClose={() => setPanel({ kind: 'none' })}>
          <RegeneratePanel
            current={state.outfit}
            panel={panel}
            onToggleHero={() => {
              const lockHero = !panel.lockHero;
              setPanel({
                ...panel,
                lockHero,
                preview: makeRegeneration(state.outfit!, lockHero),
              });
            }}
            onReason={(skipReason) => setPanel({ ...panel, skipReason })}
            onUse={() => panel.preview && acceptRegeneration(state.outfit!, panel.preview, panel.skipReason)}
            onClose={() => setPanel({ kind: 'none' })}
          />
        </ActionModal>
      )}

      {state.kind === 'ready' && state.outfit && panel.kind === 'mode' && (
        <ActionModal title="推荐模式" onClose={() => setPanel({ kind: 'none' })}>
          <ModePanel
            selected={panel.selected}
            heroEnabled={factors.heroItem}
            onSelect={(selected) => setPanel({ kind: 'mode', selected })}
            onApply={() => applyMode(panel.selected, state.outfit!)}
            onClose={() => setPanel({ kind: 'none' })}
          />
        </ActionModal>
      )}

      {state.kind === 'recording' && state.outfit && (
        <ActionModal
          title="记录已穿"
          onClose={() => setState({ kind: 'ready', result: state.result, outfit: state.outfit })}
        >
          <RecordingForm
            outfit={state.outfit}
            occasion={occasion}
            comfort={state.comfort}
            onChangeOccasion={(v) => setState({ ...state, occasion: v })}
            onChangeComfort={(v) => setState({ ...state, comfort: v })}
            onCancel={() => setState({ kind: 'ready', result: state.result, outfit: state.outfit })}
            onSubmit={() => handleSubmit(state.outfit, state.occasion, state.comfort)}
          />
        </ActionModal>
      )}

      {state.kind === 'submitted' && postWear && (
        <ActionModal title="穿后洗护" onClose={() => setPostWear(null)}>
          <PostWearPanel
            panel={postWear}
            onSelect={choosePostWearAction}
            onDone={() => void submitPostWear()}
            onSkipAll={() => setPostWear(null)}
          />
        </ActionModal>
      )}
    </TabShell>
  );
}

function ActionModal({
  title,
  onClose,
  children,
}: PropsWithChildren<{ title: string; onClose: () => void }>) {
  return (
    <Modal
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      visible
      onRequestClose={onClose}
    >
      <SafeAreaView accessibilityViewIsModal edges={['top', 'bottom', 'left', 'right']} style={styles.modalRoot}>
        <View style={styles.modalHeader}>
          <View style={styles.modalHeadingGroup}>
            <Text style={styles.modalIndex}>TODAY / ACTION</Text>
            <Text style={styles.modalTitle}>{title}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`关闭${title}`}
            hitSlop={8}
            onPress={onClose}
            style={styles.modalClose}
          >
            <Text style={styles.modalCloseLabel}>关闭</Text>
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={styles.modalScroll}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function OutfitCard({
  outfit,
  reasonCodes,
  occasion,
  onChangeOccasion,
  temperature,
  onChangeTemperature,
  mode,
  onReplace,
  onRegenerate,
  onMode,
  onWearThis,
}: {
  outfit: Outfit;
  reasonCodes: string[];
  occasion: string;
  onChangeOccasion: (v: string) => void;
  /** null = 「天气」要素已关闭，不显示气温选择。 */
  temperature: TempBand | null;
  onChangeTemperature: (v: TempBand) => void;
  mode: RecommendationMode;
  onReplace: (slot: RecommendationSlot) => void;
  onRegenerate: () => void;
  onMode: () => void;
  onWearThis: () => void;
}) {
  const top3 = topReasons(reasonCodes, 3);
  return (
    <View style={styles.outfitCard}>
      <View style={styles.editorialHeader}>
        <View style={styles.editorialHeading}>
          <Text style={styles.eyebrow}>TODAY / EDIT 01</Text>
          <Text style={styles.outfitTitle}>今日推荐</Text>
        </View>
        <Text accessibilityLabel="第一套推荐" style={styles.outfitNumber}>01</Text>
      </View>
      <View style={styles.outfitGrid}>
        <OutfitSlot label="上装" garment={outfit.top} onReplace={() => onReplace('top')} />
        <OutfitSlot label="下装" garment={outfit.bottom} onReplace={() => onReplace('bottom')} />
        <OutfitSlot label="鞋" garment={outfit.shoes} onReplace={() => onReplace('shoes')} />
        {outfit.outerwear ? (
          <OutfitSlot label="外套" garment={outfit.outerwear} onReplace={() => onReplace('outerwear')} />
        ) : null}
      </View>
      <View style={styles.reasonsBox}>
        <Text style={styles.reasonsTitle}>推荐理由</Text>
        {top3.length === 0 ? (
          <Text style={styles.reasonItem}>无可用理由</Text>
        ) : (
          top3.map((c) => (
            <Text key={c} style={styles.reasonItem}>
              · {REASON_LABEL[c] ?? c}
            </Text>
          ))
        )}
      </View>
      <View style={styles.occasionRow}>
        {OCCASIONS.map((o) => (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            onPress={() => onChangeOccasion(o.value)}
            style={[styles.chip, occasion === o.value && styles.chipActive]}
          >
            <Text style={[styles.chipLabel, occasion === o.value && styles.chipLabelActive]}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
      {temperature ? (
        <>
          <Text style={styles.reasonsTitle}>今天气温（默认按月份估计，可改）</Text>
          <View style={styles.occasionRow}>
            {TEMP_BANDS.map((band) => (
              <Pressable
                key={band}
                accessibilityRole="button"
                accessibilityState={{ selected: temperature === band }}
                onPress={() => onChangeTemperature(band)}
                style={[styles.chip, temperature === band && styles.chipActive]}
              >
                <Text style={[styles.chipLabel, temperature === band && styles.chipLabelActive]}>{TEMP_LABEL[band]}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
      <View style={styles.secondaryActions}>
        <Pressable accessibilityRole="button" onPress={onRegenerate} style={styles.secondaryBtn}>
          <Text style={styles.secondaryBtnLabel}>换一套</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onMode} style={styles.secondaryBtn}>
          <Text style={styles.secondaryBtnLabel}>推荐模式 · {MODE_LABEL[mode]}</Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="就穿这套"
        accessibilityHint="打开记录已穿表单"
        onPress={onWearThis}
        style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
      >
        <Text style={styles.primaryBtnLabel}>就穿这套</Text>
      </Pressable>
    </View>
  );
}

function GarmentImage({ garment, compact = false }: { garment: GarmentForRec; compact?: boolean }) {
  const name = garmentDisplayName(garment);
  const uri = safeTodayImageUri(garmentImageRelPath(garment));
  return (
    <View style={[styles.garmentImageFrame, compact && styles.garmentImageFrameCompact]}>
      {uri ? (
        <Image
          accessibilityLabel={`${name}图片`}
          source={{ uri }}
          contentFit="contain"
          transition={120}
          style={styles.garmentImage}
        />
      ) : (
        <GarmentArtwork category={garment.category} color={garment.color} compact={compact} />
      )}
    </View>
  );
}

function OutfitSlot({
  label,
  garment,
  onReplace,
}: {
  label: string;
  garment: GarmentForRec;
  onReplace: () => void;
}) {
  const name = garmentDisplayName(garment);
  return (
    <View style={styles.slot}>
      <GarmentImage garment={garment} />
      <View style={styles.slotMeta}>
        <Text style={styles.slotLabel}>{label}</Text>
        <Text style={styles.slotName}>{name}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`只换${label}`}
        onPress={onReplace}
        style={styles.slotAction}
      >
        <Text style={styles.slotActionLabel}>只换这件</Text>
      </Pressable>
    </View>
  );
}

const SLOT_LABEL: Record<RecommendationSlot, string> = {
  top: '上装',
  bottom: '下装',
  shoes: '鞋',
  outerwear: '外套',
};

const MODE_LABEL: Record<RecommendationMode, string> = {
  safe: '稳妥',
  fresh: '新鲜',
  hero: '主角单品',
  hurry: '赶时间',
};

function ReplacementPanel({
  slot,
  candidates,
  onChoose,
  onClose,
}: {
  slot: RecommendationSlot;
  candidates: GarmentForRec[];
  onChoose: (candidate: GarmentForRec) => void;
  onClose: () => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.formHint}>其余单品已固定，仅显示同槽且当前可用的候选。</Text>
      {candidates.length === 0 ? (
        <Text style={styles.errorText}>没有其他可用候选。可先更新洗护状态，或返回换一套。</Text>
      ) : (
        candidates.map((candidate) => (
          <Pressable
            key={candidate.id}
            accessibilityRole="button"
            accessibilityLabel={`换成 ${garmentDisplayName(candidate)}`}
            onPress={() => onChoose(candidate)}
            style={styles.candidateRow}
          >
            <GarmentImage garment={candidate} compact />
            <View style={styles.candidateText}>
              <Text style={styles.slotLabel}>{CATEGORY_LABEL[candidate.category] ?? '衣物'}</Text>
              <Text style={styles.slotName}>{garmentDisplayName(candidate)}</Text>
            </View>
            <Text style={styles.weatherAction}>换成这件</Text>
          </Pressable>
        ))
      )}
      <Pressable accessibilityRole="button" onPress={onClose} style={styles.linkBtn}>
        <Text style={styles.linkBtnLabel}>返回当前搭配</Text>
      </Pressable>
    </View>
  );
}

function MiniOutfit({ outfit }: { outfit: Outfit }) {
  const garments = [outfit.top, outfit.bottom, outfit.shoes, ...(outfit.outerwear ? [outfit.outerwear] : [])];
  return (
    <View style={styles.miniOutfit}>
      {garments.map((garment) => (
        <View key={garment.id} style={styles.miniGarment}>
          <GarmentImage garment={garment} compact />
          <Text style={styles.miniGarmentName}>{garmentDisplayName(garment)}</Text>
        </View>
      ))}
    </View>
  );
}

function RegeneratePanel({
  panel,
  onToggleHero,
  onReason,
  onUse,
  onClose,
}: {
  current: Outfit;
  panel: Extract<PanelState, { kind: 'regenerate' }>;
  onToggleHero: () => void;
  onReason: (reason: string) => void;
  onUse: () => void;
  onClose: () => void;
}) {
  const reasons = ['不合场景', '不喜欢配色', '今天想换风格'];
  return (
    <View style={styles.card}>
      <Pressable accessibilityRole="button" onPress={onToggleHero} style={styles.secondaryBtn}>
        <Text style={styles.secondaryBtnLabel}>{panel.lockHero ? '✓ ' : ''}保留上装作为主角</Text>
      </Pressable>
      <Text style={styles.fieldLabel}>跳过原因（可选）</Text>
      <View style={styles.occasionRow}>
        {reasons.map((reason) => (
          <Pressable
            key={reason}
            accessibilityRole="button"
            onPress={() => onReason(reason)}
            style={[styles.chip, panel.skipReason === reason && styles.chipActive]}
          >
            <Text style={[styles.chipLabel, panel.skipReason === reason && styles.chipLabelActive]}>{reason}</Text>
          </Pressable>
        ))}
      </View>
      {panel.preview ? (
        <>
          <Text style={styles.fieldLabel}>新搭配预览</Text>
          <MiniOutfit outfit={panel.preview} />
          <Pressable accessibilityRole="button" onPress={onUse} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnLabel}>使用新搭配</Text>
          </Pressable>
        </>
      ) : (
        <Text style={styles.errorText}>没有更多组合。可解除主角锁定或补充可用衣物。</Text>
      )}
      <Pressable accessibilityRole="button" onPress={onClose} style={styles.linkBtn}>
        <Text style={styles.linkBtnLabel}>保留当前搭配</Text>
      </Pressable>
    </View>
  );
}

function ModePanel({
  selected,
  heroEnabled,
  onSelect,
  onApply,
  onClose,
}: {
  selected: RecommendationMode;
  heroEnabled: boolean;
  onSelect: (mode: RecommendationMode) => void;
  onApply: () => void;
  onClose: () => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.formHint}>硬约束始终优先，模式只改变可用衣物的排序。</Text>
      <View style={styles.occasionRow}>
        {(Object.keys(MODE_LABEL) as RecommendationMode[])
          .filter((value) => value !== 'hero' || heroEnabled)
          .map((value) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            onPress={() => onSelect(value)}
            style={[styles.chip, selected === value && styles.chipActive]}
          >
            <Text style={[styles.chipLabel, selected === value && styles.chipLabelActive]}>{MODE_LABEL[value]}</Text>
          </Pressable>
          ))}
      </View>
      <Pressable accessibilityRole="button" onPress={onApply} style={styles.primaryBtn}>
        <Text style={styles.primaryBtnLabel}>应用模式</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onClose} style={styles.linkBtn}>
        <Text style={styles.linkBtnLabel}>取消</Text>
      </Pressable>
    </View>
  );
}

function RecordingForm({
  outfit,
  occasion,
  comfort,
  onChangeOccasion,
  onChangeComfort,
  onCancel,
  onSubmit,
}: {
  outfit: Outfit;
  occasion: string;
  comfort: 'good' | 'ok' | 'bad';
  onChangeOccasion: (v: string) => void;
  onChangeComfort: (v: 'good' | 'ok' | 'bad') => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.fieldLabel}>本次搭配</Text>
      <MiniOutfit outfit={outfit} />

      <Text style={styles.fieldLabel}>场景</Text>
      <View style={styles.occasionRow}>
        {OCCASIONS.map((o) => (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            onPress={() => onChangeOccasion(o.value)}
            style={[styles.chip, occasion === o.value && styles.chipActive]}
          >
            <Text style={[styles.chipLabel, occasion === o.value && styles.chipLabelActive]}>{o.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.fieldLabel}>舒适度</Text>
      <View style={styles.occasionRow}>
        {COMFORTS.map((c) => (
          <Pressable
            key={c.value}
            accessibilityRole="button"
            onPress={() => onChangeComfort(c.value)}
            style={[styles.chip, comfort === c.value && styles.chipActive]}
          >
            <Text style={[styles.chipLabel, comfort === c.value && styles.chipLabelActive]}>{c.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.formActions}>
        <Pressable accessibilityRole="button" onPress={onCancel} style={styles.secondaryBtn}>
          <Text style={styles.secondaryBtnLabel}>取消</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onSubmit}
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed, { flex: 1 }]}
        >
          <Text style={styles.primaryBtnLabel}>完成记录</Text>
        </Pressable>
      </View>
    </View>
  );
}

const POST_WEAR_ACTIONS: { value: PostWearAction; label: string }[] = [
  { value: 'laundry', label: '待洗' },
  { value: 'dryclean', label: '干洗' },
  { value: 'clean', label: '保持干净' },
  { value: 'skip', label: '跳过' },
];

/** TDY-07 穿后洗护面板：逐件选择洗护动作，默认全部「跳过」。 */
function PostWearPanel({
  panel,
  onSelect,
  onDone,
  onSkipAll,
}: {
  panel: PostWearPanelState;
  onSelect: (garmentId: string, action: PostWearAction) => void;
  onDone: () => void;
  onSkipAll: () => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.formHint}>刚穿过的衣物需要洗护吗？逐件选择，默认跳过。</Text>
      {panel.entries.map((entry) => (
        <View key={entry.garmentId} style={styles.postWearRow}>
          <Text style={styles.slotName} numberOfLines={1}>
            {entry.slotLabel} · {entry.name}
          </Text>
          <View style={styles.occasionRow}>
            {POST_WEAR_ACTIONS.map((action) => (
              <Pressable
                key={action.value}
                accessibilityRole="button"
                accessibilityLabel={`${entry.name}${action.label}`}
                disabled={panel.busy}
                onPress={() => onSelect(entry.garmentId, action.value)}
                style={[styles.chip, panel.decisions[entry.garmentId] === action.value && styles.chipActive]}
              >
                <Text
                  style={[
                    styles.chipLabel,
                    panel.decisions[entry.garmentId] === action.value && styles.chipLabelActive,
                  ]}
                >
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      {panel.error ? <Text style={styles.postWearError}>{panel.error}</Text> : null}
      <View style={styles.formActions}>
        <Pressable
          accessibilityRole="button"
          disabled={panel.busy}
          onPress={onSkipAll}
          style={styles.secondaryBtn}
        >
          <Text style={styles.secondaryBtnLabel}>全部跳过</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={panel.busy}
          onPress={onDone}
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed, { flex: 1 }]}
        >
          <Text style={styles.primaryBtnLabel}>{panel.busy ? '保存中…' : '完成'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  settingsButton: {
    width: hitTarget.preferred,
    height: hitTarget.preferred,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    borderRadius: radius.pill,
  },
  scroll: {
    paddingBottom: spacing.xxl,
  },
  modalRoot: {
    flex: 1,
    backgroundColor: palette.paperWhite,
  },
  modalHeader: {
    minHeight: 104,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.hairline,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  modalHeadingGroup: {
    flex: 1,
  },
  modalIndex: {
    ...typography.caption,
    color: palette.mutedGold,
    letterSpacing: 1.5,
    marginBottom: spacing.xxs,
  },
  modalTitle: {
    ...typography.title,
    color: palette.charcoal,
  },
  modalClose: {
    minWidth: hitTarget.preferred,
    minHeight: hitTarget.preferred,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseLabel: {
    ...typography.bodySm,
    color: palette.charcoal,
  },
  modalScroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  weatherAction: {
    ...typography.caption,
    color: palette.charcoal,
  },
  errorText: {
    ...typography.bodySm,
    color: palette.oxblood,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  stage: {
    alignItems: 'center',
    paddingTop: spacing.xxl,
    paddingBottom: spacing.lg,
  },
  stageNumber: {
    ...typography.display,
    color: palette.mutedGold,
  },
  stageLabel: {
    ...typography.bodySm,
    color: palette.charcoalSoft,
    marginTop: spacing.xs,
  },
  stateSection: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    paddingVertical: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    gap: spacing.sm,
  },
  stateTitle: {
    ...typography.headline,
    color: palette.charcoal,
  },
  stateDescription: {
    ...typography.body,
    color: palette.charcoalSoft,
    marginBottom: spacing.sm,
  },
  card: {
    paddingBottom: spacing.lg,
    backgroundColor: palette.paperWhite,
  },
  eyebrow: {
    ...typography.caption,
    fontFamily: 'serif',
    color: palette.charcoalSoft,
    letterSpacing: 2,
    marginBottom: spacing.sm,
  },
  outfitCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    paddingVertical: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    backgroundColor: palette.paperWhite,
  },
  editorialHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  editorialHeading: {
    flex: 1,
  },
  outfitTitle: {
    ...typography.title,
    color: palette.charcoal,
  },
  outfitNumber: {
    ...typography.display,
    color: palette.mutedGold,
  },
  outfitGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  slot: {
    flexGrow: 1,
    flexBasis: '46%',
    minWidth: 132,
    paddingBottom: spacing.sm,
    backgroundColor: palette.paperWhite,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.hairline,
  },
  garmentImageFrame: {
    width: '100%',
    aspectRatio: 0.92,
    backgroundColor: palette.sandSoft,
    overflow: 'hidden',
  },
  garmentImageFrameCompact: {
    width: 56,
    aspectRatio: 0.88,
    flexShrink: 0,
  },
  garmentImage: {
    width: '100%',
    height: '100%',
  },
  slotMeta: {
    paddingTop: spacing.sm,
    minHeight: 58,
  },
  slotLabel: {
    ...typography.caption,
    color: palette.charcoalSoft,
  },
  slotName: {
    ...typography.body,
    color: palette.charcoal,
    marginTop: spacing.xxs,
  },
  slotAction: {
    minHeight: hitTarget.min,
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  slotActionLabel: {
    ...typography.caption,
    color: palette.charcoal,
  },
  reasonsBox: {
    padding: spacing.sm,
    backgroundColor: palette.paperWhite,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    marginBottom: spacing.md,
  },
  reasonsTitle: {
    ...typography.caption,
    color: palette.mutedGold,
    marginBottom: spacing.xxs,
  },
  reasonItem: {
    ...typography.bodySm,
    color: palette.charcoalSoft,
    marginTop: spacing.xxs,
  },
  occasionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    backgroundColor: palette.paperWhite,
    minHeight: hitTarget.min,
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: palette.oxblood,
    borderColor: palette.oxblood,
  },
  chipLabel: {
    ...typography.bodySm,
    color: palette.charcoal,
  },
  chipLabelActive: {
    color: palette.white,
  },
  primaryBtn: {
    minHeight: hitTarget.preferred,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: palette.charcoal,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
  },
  primaryBtnPressed: {
    backgroundColor: palette.charcoalSoft,
  },
  primaryBtnLabel: {
    ...typography.body,
    color: palette.white,
  },
  secondaryActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  candidateRow: {
    minHeight: hitTarget.preferred,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.hairline,
    backgroundColor: palette.paperWhite,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  candidateText: {
    flex: 1,
    minWidth: 0,
  },
  miniOutfit: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  miniGarment: {
    width: 72,
  },
  miniGarmentName: {
    ...typography.caption,
    color: palette.charcoal,
    marginTop: spacing.xs,
  },
  formHint: {
    ...typography.bodySm,
    color: palette.charcoalSoft,
    marginBottom: spacing.md,
  },
  fieldLabel: {
    ...typography.caption,
    color: palette.charcoalSoft,
    marginBottom: spacing.xs,
  },
  formActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  secondaryBtn: {
    minHeight: hitTarget.preferred,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    borderRadius: radius.md,
  },
  secondaryBtnLabel: {
    ...typography.body,
    color: palette.charcoal,
  },
  linkBtn: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  linkBtnLabel: {
    ...typography.bodySm,
    color: palette.mutedGold,
  },
  postWearRow: {
    marginBottom: spacing.md,
    padding: spacing.sm,
    backgroundColor: palette.paperWhite,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
  },
  postWearError: {
    ...typography.bodySm,
    color: palette.oxblood,
    marginBottom: spacing.sm,
  },
});
