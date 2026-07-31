import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

import { palette, radius, spacing, typography, hitTarget } from '@/design-system';
import { EmptyStateCard } from '@/features/shell/EmptyStateCard';
import { TabShell } from '@/features/shell/TabShell';
import { openAppDb } from '@/core/db/expoDb';
import { listActiveGarments } from '@/core/db/dao';
import { writeMirror } from '@/core/garments/mirror';
import {
  generateRecommendation,
  REASON_LABEL,
  topReasons,
  type GarmentForRec,
  type Outfit,
  type RecResult,
} from '@/core/recommend';
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
import type { WeatherResolution } from '@/core/weather';
import type { GarmentRow } from '@/core/db/schema';
import {
  DEFAULT_CITIES,
  defaultWeatherController,
  type WeatherController,
} from './todayWeather';

/** 今日页加载器：返回推荐输入（衣物 + wear stats 聚合）。失败返回空数组（→ 空状态）。 */
export async function loadTodayItems(): Promise<GarmentForRec[]> {
  try {
    const app = await openAppDb();
    const rows = await listActiveGarments(app.db);
    const stats = await getWearStats(app.drizzleDb);
    return rows.map((r: GarmentRow) => ({
      id: r.id,
      category: r.category as GarmentForRec['category'],
      status: r.status as GarmentForRec['status'],
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      lastWornAt: stats.get(r.id)?.lastWornAt ?? null,
      timesWorn: stats.get(r.id)?.timesWorn ?? 0,
      archivedAt: r.archivedAt,
    }));
  } catch {
    return [];
  }
}

interface TodayScreenProps {
  /** 测试或预览注入；默认走 loadTodayItems。 */
  loadItems?: () => Promise<GarmentForRec[]>;
  /** 提交记录的可注入实现；默认走 recordWear + writeMirror。 */
  onSubmit?: (input: SubmitInput) => Promise<{ inserted: boolean }>;
  /** 推荐反馈可注入实现；默认写 feedback_events + 镜像。 */
  onFeedback?: (input: FeedbackInput) => Promise<{ inserted: boolean }>;
  /** 天气适配可注入，测试不触碰网络/定位。 */
  weatherController?: WeatherController;
  /** 反馈软权重加载器。 */
  loadFeedbackWeights?: () => Promise<Map<string, number>>;
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
  | { kind: 'empty' }
  | { kind: 'ready'; result: RecResult; outfit: Outfit | null }
  | { kind: 'recording'; result: RecResult; outfit: Outfit; occasion: string; comfort: 'good' | 'ok' | 'bad' }
  | { kind: 'submitted'; result: RecResult; outfit: Outfit; inserted: boolean };

type PanelState =
  | { kind: 'none' }
  | { kind: 'replace'; slot: RecommendationSlot; candidates: GarmentForRec[] }
  | { kind: 'regenerate'; preview: Outfit | null; skipReason: string; lockHero: boolean }
  | { kind: 'mode'; selected: RecommendationMode }
  | { kind: 'weather'; persistCity: boolean; busy: boolean; message: string | null };

const NO_WEATHER: WeatherResolution = { status: 'none', weather: null };

async function loadStoredFeedbackWeights(): Promise<Map<string, number>> {
  const app = await openAppDb();
  return buildFeedbackWeights(await listFeedback(app.drizzleDb));
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

/** 今日页（MVP-005/006）：推荐、换一件、换一套、模式、天气降级与反馈。 */
export default function TodayScreen({
  loadItems = loadTodayItems,
  onSubmit,
  onFeedback,
  weatherController = defaultWeatherController,
  loadFeedbackWeights = loadStoredFeedbackWeights,
  defaultOccasion = 'commute',
  now,
}: TodayScreenProps) {
  const [nowVal] = useState(() => now ?? Date.now());
  const [state, setState] = useState<ViewState>({ kind: 'loading' });
  const [occasion, setOccasion] = useState<string>(defaultOccasion);
  const [items, setItems] = useState<GarmentForRec[]>([]);
  const [mode, setMode] = useState<RecommendationMode>('safe');
  const [panel, setPanel] = useState<PanelState>({ kind: 'none' });
  const [weather, setWeather] = useState<WeatherResolution>(NO_WEATHER);
  const [feedbackWeights, setFeedbackWeights] = useState<Map<string, number>>(new Map());
  const [avoidedSignatures, setAvoidedSignatures] = useState<string[]>([]);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const recContext = useCallback(
    (weatherValue: WeatherResolution = weather) => ({
      now: nowVal,
      occasion: occasion as 'commute' | 'casual' | 'formal' | 'travel' | 'sport',
      weatherTempC: weatherValue.weather
        ? (weatherValue.weather.minTempC + weatherValue.weather.maxTempC) / 2
        : null,
      recentItemIds: [] as readonly string[],
    }),
    [nowVal, occasion, weather],
  );

  const refresh = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const [loadedItems, initialWeather, weights] = await Promise.all([
        loadItems(),
        weatherController.loadInitial().catch(() => NO_WEATHER),
        loadFeedbackWeights().catch(() => new Map<string, number>()),
      ]);
      setItems(loadedItems);
      setWeather(initialWeather);
      setFeedbackWeights(weights);
      if (loadedItems.length === 0) {
        setState({ kind: 'empty' });
        return;
      }
      const result = generateRecommendation(loadedItems, {
        now: nowVal,
        occasion: occasion as 'commute' | 'casual' | 'formal' | 'travel' | 'sport',
        weatherTempC: initialWeather.weather
          ? (initialWeather.weather.minTempC + initialWeather.weather.maxTempC) / 2
          : null,
        recentItemIds: [],
      });
      if (result.ok) {
        setState({ kind: 'ready', result, outfit: result.outfit });
      } else {
        setState({ kind: 'ready', result, outfit: null });
      }
    } catch {
      setState({ kind: 'empty' });
    }
  }, [loadFeedbackWeights, loadItems, occasion, nowVal, weatherController]);

  useEffect(() => {
    // refresh 内部 setState 在 await 之后（异步回调里），非 effect 同步 setState；
    // 规则静态分析无法穿透 async 边界，故 disable。.catch 兜底避免未处理 rejection。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().catch(() => {
      /* 加载失败保留 loading；下次焦点可重试 */
    });
  }, [refresh]);

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
        } else {
          const app = await openAppDb();
          const r = await recordWear(app.drizzleDb, {
            recommendationId: input.recommendationId,
            date: input.date,
            outfit: input.outfit,
            occasion: input.occasion,
            comfort: input.comfort,
            now: input.now,
          });
          // 写持久镜像（B-4 兜底）
          const root = `${FileSystem.documentDirectory?.replace(/\/$/, '') ?? '/tmp'}/clothes`;
          await writeMirror(root, app.db, app.drizzleDb, nowVal);
          setState((prev) =>
            prev.kind === 'recording' ? { kind: 'submitted', result: prev.result, outfit: prev.outfit, inserted: r.inserted } : prev,
          );
        }
      } catch {
        // 失败保留当前搭配和填写内容，允许幂等重试（任务卡要求）
        setState((prev) =>
          prev.kind === 'recording' ? { kind: 'submitted', result: prev.result, outfit: prev.outfit, inserted: false } : prev,
        );
      }
    },
    [mode, nowVal, occasion, onFeedback, onSubmit],
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
      });
      setPanel({ kind: 'replace', slot, candidates });
    },
    [feedbackWeights, items, mode, recContext],
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
      });
      return result.ok ? result.outfit : null;
    },
    [avoidedSignatures, feedbackWeights, items, mode, recContext],
  );

  const acceptRegeneration = useCallback(
    (current: Outfit, preview: Outfit, skipReason: string) => {
      const result = regenerateOutfit(items, recContext(), {
        mode,
        avoidSignatures: [...avoidedSignatures, outfitSignature(current)],
        feedbackWeights,
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
    [avoidedSignatures, feedbackWeights, items, mode, nowVal, occasion, persistFeedback, recContext],
  );

  const applyMode = useCallback(
    (selected: RecommendationMode, current: Outfit) => {
      const result = regenerateOutfit(items, recContext(), {
        mode: selected,
        avoidSignatures: [],
        lockedHeroId: selected === 'hero' ? current.top.id : null,
        feedbackWeights,
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
    [feedbackWeights, items, nowVal, occasion, persistFeedback, recContext],
  );

  const applyWeather = useCallback(
    (resolution: WeatherResolution) => {
      setWeather(resolution);
      setPanel({ kind: 'none' });
      if (!resolution.weather) return;
      const result = regenerateOutfit(items, recContext(resolution), {
        mode,
        avoidSignatures: [],
        feedbackWeights,
      });
      if (result.ok) setState({ kind: 'ready', result, outfit: result.outfit });
    },
    [feedbackWeights, items, mode, recContext],
  );

  const today = formatDate(nowVal);

  return (
    <TabShell title="今天" subtitle={today}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <WeatherBar
          weather={weather}
          onOpen={() => setPanel({ kind: 'weather', persistCity: true, busy: false, message: null })}
        />
        {feedbackError ? <Text style={styles.errorText}>{feedbackError}</Text> : null}
        {state.kind === 'loading' && (
          <View style={styles.stage}>
            <Text style={styles.stageLabel}>加载今日搭配…</Text>
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
              description="录入 6 件即可预览第一套搭配，录满 12 件解锁可解释的今日推荐。照片只在本机处理，原图不会被覆盖。"
              actionLabel="开始整理衣橱"
              actionHint="首次激活流程将在 MVP-004 接通"
            />
          </>
        )}

        {state.kind === 'ready' && state.outfit == null && !state.result.ok && (
          <EmptyStateCard
            eyebrow="02"
            title="衣橱还差几件"
            description={`缺槽位：${state.result.missing.join('、')}。补录后即可生成今日搭配。`}
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

        {state.kind === 'ready' && state.outfit && panel.kind === 'replace' && (
          <ReplacementPanel
            slot={panel.slot}
            candidates={panel.candidates}
            onChoose={(candidate) => chooseReplacement(state.outfit!, panel.slot, candidate, state.result)}
            onClose={() => setPanel({ kind: 'none' })}
          />
        )}

        {state.kind === 'ready' && state.outfit && panel.kind === 'regenerate' && (
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
        )}

        {state.kind === 'ready' && state.outfit && panel.kind === 'mode' && (
          <ModePanel
            selected={panel.selected}
            onSelect={(selected) => setPanel({ kind: 'mode', selected })}
            onApply={() => applyMode(panel.selected, state.outfit!)}
            onClose={() => setPanel({ kind: 'none' })}
          />
        )}

        {panel.kind === 'weather' && (
          <WeatherPanel
            panel={panel}
            onPanel={setPanel}
            controller={weatherController}
            onUse={applyWeather}
            onNoWeather={() => applyWeather(NO_WEATHER)}
          />
        )}

        {state.kind === 'recording' && state.outfit && (
          <RecordingForm
            outfit={state.outfit}
            occasion={occasion}
            comfort={state.comfort}
            onChangeOccasion={(v) => setState({ ...state, occasion: v })}
            onChangeComfort={(v) => setState({ ...state, comfort: v })}
            onCancel={() =>
              setState({ kind: 'ready', result: state.result, outfit: state.outfit })
            }
            onSubmit={() => handleSubmit(state.outfit, state.occasion, state.comfort)}
          />
        )}

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
    </TabShell>
  );
}

function OutfitCard({
  outfit,
  reasonCodes,
  occasion,
  onChangeOccasion,
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
  mode: RecommendationMode;
  onReplace: (slot: RecommendationSlot) => void;
  onRegenerate: () => void;
  onMode: () => void;
  onWearThis: () => void;
}) {
  const top3 = topReasons(reasonCodes, 3);
  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>今日推荐</Text>
      <View style={styles.outfitRow}>
        <OutfitSlot label="上装" name={outfit.top.id} onReplace={() => onReplace('top')} />
        <OutfitSlot label="下装" name={outfit.bottom.id} onReplace={() => onReplace('bottom')} />
        <OutfitSlot label="鞋" name={outfit.shoes.id} onReplace={() => onReplace('shoes')} />
        {outfit.outerwear ? (
          <OutfitSlot label="外套" name={outfit.outerwear.id} onReplace={() => onReplace('outerwear')} />
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
        onPress={onWearThis}
        style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
      >
        <Text style={styles.primaryBtnLabel}>就穿这套</Text>
      </Pressable>
    </View>
  );
}

function OutfitSlot({ label, name, onReplace }: { label: string; name: string; onReplace: () => void }) {
  return (
    <View style={styles.slot}>
      <Text style={styles.slotLabel}>{label}</Text>
      <Text style={styles.slotName} numberOfLines={1}>
        {name}
      </Text>
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

function WeatherBar({ weather, onOpen }: { weather: WeatherResolution; onOpen: () => void }) {
  const text = weather.weather
    ? `${weather.weather.cityName} ${weather.weather.minTempC}–${weather.weather.maxTempC}℃ · ${
        weather.status === 'live'
          ? '刚刚更新'
          : weather.status === 'cache-fresh'
            ? '使用缓存'
            : '离线旧缓存'
      }`
    : '未使用天气 · 仍按衣橱规则推荐';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="天气设置" onPress={onOpen} style={styles.weatherBar}>
      <Text style={styles.weatherText}>{text}</Text>
      <Text style={styles.weatherAction}>设置</Text>
    </Pressable>
  );
}

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
      <Text style={styles.eyebrow}>只换{SLOT_LABEL[slot]}</Text>
      <Text style={styles.formHint}>其余单品已固定，仅显示同槽且当前可用的候选。</Text>
      {candidates.length === 0 ? (
        <Text style={styles.errorText}>没有其他可用候选。可先更新洗护状态，或返回换一套。</Text>
      ) : (
        candidates.map((candidate) => (
          <Pressable
            key={candidate.id}
            accessibilityRole="button"
            accessibilityLabel={`换成 ${candidate.id}`}
            onPress={() => onChoose(candidate)}
            style={styles.candidateRow}
          >
            <Text style={styles.slotName}>{candidate.id}</Text>
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
  return (
    <Text style={styles.formHint}>
      {outfit.top.id} · {outfit.bottom.id} · {outfit.shoes.id}
      {outfit.outerwear ? ` · ${outfit.outerwear.id}` : ''}
    </Text>
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
      <Text style={styles.eyebrow}>换一套</Text>
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
  onSelect,
  onApply,
  onClose,
}: {
  selected: RecommendationMode;
  onSelect: (mode: RecommendationMode) => void;
  onApply: () => void;
  onClose: () => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>推荐模式</Text>
      <Text style={styles.formHint}>硬约束始终优先，模式只改变可用衣物的排序。</Text>
      <View style={styles.occasionRow}>
        {(Object.keys(MODE_LABEL) as RecommendationMode[]).map((value) => (
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

function WeatherPanel({
  panel,
  onPanel,
  controller,
  onUse,
  onNoWeather,
}: {
  panel: Extract<PanelState, { kind: 'weather' }>;
  onPanel: (panel: PanelState) => void;
  controller: WeatherController;
  onUse: (weather: WeatherResolution) => void;
  onNoWeather: () => void;
}) {
  const setBusy = (message: string | null) => onPanel({ ...panel, busy: true, message });
  const selectCity = async (city: (typeof DEFAULT_CITIES)[number]) => {
    setBusy(`正在获取${city.name}天气…`);
    const result = await controller.useCity(city, panel.persistCity).catch(() => NO_WEATHER);
    onUse(result);
  };
  const selectCurrentLocation = async () => {
    setBusy('仅本次请求前台位置…');
    const result = await controller.useCurrentLocation();
    if (result.locationStatus !== 'granted') {
      onPanel({ ...panel, busy: false, message: '定位未授权，可手选城市或无天气继续。' });
      return;
    }
    onUse(result.weather);
  };
  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>天气设置</Text>
      <Text style={styles.formHint}>定位只在点击“使用当前位置”后申请，绝不请求后台位置。</Text>
      <View style={styles.occasionRow}>
        {DEFAULT_CITIES.map((city) => (
          <Pressable
            key={city.id}
            accessibilityRole="button"
            disabled={panel.busy}
            onPress={() => void selectCity(city)}
            style={styles.chip}
          >
            <Text style={styles.chipLabel}>{city.name}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={panel.busy}
        onPress={() => onPanel({ ...panel, persistCity: !panel.persistCity })}
        style={styles.secondaryBtn}
      >
        <Text style={styles.secondaryBtnLabel}>{panel.persistCity ? '✓ 记住城市' : '仅本次使用'}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        disabled={panel.busy}
        onPress={() => void selectCurrentLocation()}
        style={styles.secondaryBtn}
      >
        <Text style={styles.secondaryBtnLabel}>使用当前位置</Text>
      </Pressable>
      {panel.message ? <Text style={styles.formHint}>{panel.message}</Text> : null}
      <Pressable accessibilityRole="button" disabled={panel.busy} onPress={onNoWeather} style={styles.linkBtn}>
        <Text style={styles.linkBtnLabel}>无天气继续</Text>
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
      <Text style={styles.eyebrow}>记录已穿</Text>
      <Text style={styles.formHint}>
        搭配：{outfit.top.id} · {outfit.bottom.id} · {outfit.shoes.id}
        {outfit.outerwear ? ` · ${outfit.outerwear.id}` : ''}
      </Text>

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

const styles = StyleSheet.create({
  scroll: {
    paddingBottom: spacing.xxl,
  },
  weatherBar: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    minHeight: hitTarget.preferred,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    borderRadius: radius.md,
    backgroundColor: palette.paperWhite,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  weatherText: {
    ...typography.bodySm,
    color: palette.charcoalSoft,
    flex: 1,
  },
  weatherAction: {
    ...typography.caption,
    color: palette.mutedGold,
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
  card: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.lg,
    backgroundColor: palette.sandSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    borderRadius: radius.lg,
  },
  eyebrow: {
    ...typography.caption,
    fontFamily: 'serif',
    color: palette.mutedGold,
    letterSpacing: 2,
    marginBottom: spacing.sm,
  },
  outfitRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  slot: {
    flex: 1,
    minWidth: 80,
    padding: spacing.sm,
    backgroundColor: palette.paperWhite,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
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
    color: palette.mutedGold,
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
    backgroundColor: palette.oxblood,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
  },
  primaryBtnPressed: {
    backgroundColor: palette.oxbloodDeep,
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
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    backgroundColor: palette.paperWhite,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
});
