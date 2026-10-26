import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { hitTarget, palette, radius, spacing, typography } from '@/design-system';
import { openAppDb } from '@/core/db/expoDb';
import { listActiveGarments } from '@/core/db/dao';
import { addOriginalOnly } from '@/core/cutout/cutoutService';
import { defaultDemoDataService } from '@/core/demo/demoDataService';
import { extFromUri } from '@/core/files/uri';
import {
  buildFirstOutfit,
  computeStep,
  loadOnboardState,
  QUOTA,
  QUOTA_TOTAL,
  quotaStatus,
  saveOnboardState,
  type OnboardCategory,
  type OnboardState,
  type OnboardStep,
  type QuotaStatus,
} from '@/core/onboarding';

const GOALS = ['commute', 'travel', 'revive', 'buy-less'] as const;
const GOAL_LABEL: Record<(typeof GOALS)[number], string> = {
  commute: '通勤得体',
  travel: '旅行打包',
  revive: '盘活闲置',
  'buy-less': '减少购买',
};

const PICK_CATS: OnboardCategory[] = ['top', 'bottom', 'dress', 'shoes', 'outerwear', 'free'];
const PICK_LABEL: Record<OnboardCategory, string> = {
  top: '上装',
  bottom: '下装',
  dress: '连衣裙',
  shoes: '鞋',
  outerwear: '外套',
  free: '自由',
};

/** 据当前配额缺口推荐下一个录入类别：优先缺口最多的槽，无缺口则 free。 */
function recommendPick(status: QuotaStatus): OnboardCategory {
  if (status.missing.length === 0) return 'free';
  const counts: Record<OnboardCategory, number> = { top: 0, bottom: 0, dress: 0, shoes: 0, outerwear: 0, free: 0 };
  for (const m of status.missing) counts[m]++;
  let best: OnboardCategory = status.missing[0];
  let max = 0;
  for (const k of PICK_CATS) {
    if (counts[k] > max) {
      max = counts[k];
      best = k;
    }
  }
  return best;
}

/** onboarding 的 free 槽在 schema 里映射为 accessory（NORM 把 accessory→free）。 */
const SCHEMA_CAT: Record<OnboardCategory, string> = {
  top: 'top',
  bottom: 'bottom',
  dress: 'dress',
  shoes: 'shoes',
  outerwear: 'outerwear',
  free: 'accessory',
};

/** 卡片容器（模块级组件，避免在 render 内定义导致 state 重置）。 */
function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

/** 主按钮（模块级组件）。 */
function Primary({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={[styles.btn, disabled && styles.btnDisabled]}>
      <Text style={styles.btnLabel}>{label}</Text>
    </Pressable>
  );
}

function Secondary({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={[styles.secondaryBtn, disabled && styles.btnDisabled]}>
      <Text style={styles.secondaryBtnLabel}>{label}</Text>
    </Pressable>
  );
}

/** 首次激活 ONB-01..07：状态机驱动，每步/每件持久，重启恢复；12 件首套只含真实衣物。 */
export default function OnboardingScreen() {
  const router = useRouter();
  const [state, setState] = useState<OnboardState | null>(null);
  const [items, setItems] = useState<{ id: string; category: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [outfit, setOutfit] = useState<ReturnType<typeof buildFirstOutfit> | null>(null);
  const [pickCat, setPickCat] = useState<OnboardCategory>('top');

  const refresh = useCallback(async () => {
    const app = await openAppDb();
    const st = await loadOnboardState(app.db);
    const list = await listActiveGarments(app.db);
    const mapped = list.map((i: { id: string; category: string }) => ({ id: i.id, category: i.category }));
    setItems(mapped);
    const step = computeStep(st, list.length, st.completed);
    const next = { ...st, step };
    setState(next);
    // 据当前配额缺口自动推荐录入类别（用户可手动覆盖）
    setPickCat((prev) => {
      const st2 = quotaStatus(mapped);
      // 已无缺口则保持当前选择；当前选中类别仍有缺口也保持
      if (st2.missing.length === 0) return prev;
      // missing 是 QuotaSlot[]（不含 dress）；dress 不会在其中，返回 false 走推荐
      if ((st2.missing as readonly OnboardCategory[]).includes(prev)) return prev;
      return recommendPick(st2);
    });
    if (step === 'reveal' || step === 'preview') {
      setOutfit(buildFirstOutfit(mapped));
    }
    return { app, st: next, items: list };
  }, []);

  useEffect(() => {
    // refresh 内部 setState 都在 await 之后（异步回调里），并非 effect 同步 setState；
    // 规则静态分析无法穿透 async 边界，故 disable。.catch 兜底避免未处理 rejection。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().catch(() => {});
  }, [refresh]);

  const persist = async (mut: (s: OnboardState) => OnboardState) => {
    const app = await openAppDb();
    const cur = state ?? (await loadOnboardState(app.db));
    const next = mut(cur);
    await saveOnboardState(app.db, next);
    setState(next);
  };

  const advanceIntro = () => {
    const order: OnboardStep[] = ['welcome', 'value', 'privacy', 'goals', 'quota'];
    const idx = order.indexOf(state?.step ?? 'welcome');
    const nextStep = order[Math.min(idx + 1, order.length - 1)];
    void persist((s) => ({ ...s, step: nextStep, quotaStarted: nextStep === 'quota' ? true : s.quotaStarted }));
  };

  const toggleGoal = (g: (typeof GOALS)[number]) => {
    void persist((s) => ({
      ...s,
      goals: s.goals.includes(g) ? s.goals.filter((x) => x !== g) : [...s.goals, g],
    }));
  };

  const addOne = async () => {
    setBusy(true);
    setNote('');
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setNote('相册权限被拒绝：可稍后在衣橱补录，不阻塞浏览。');
        setBusy(false);
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
      if (res.canceled || !res.assets[0]) {
        setBusy(false);
        return;
      }
      const a = res.assets[0];
      const app = await openAppDb();
      await addOriginalOnly(app, {
        uri: a.uri,
        ext: extFromUri(a.uri, a.mimeType),
        name: `${PICK_LABEL[pickCat]} ${items.length + 1}`,
        category: SCHEMA_CAT[pickCat],
      });
      await refresh();
    } catch (e) {
      setNote('添加失败：' + String(e));
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    await persist((s) => ({ ...s, completed: true, step: 'done' }));
    router.replace('/');
  };

  const finishLater = async () => {
    await persist((s) => ({ ...s, completed: true, step: 'done' }));
    router.replace('/');
  };

  const startDemo = async () => {
    if (busy) return;
    setBusy(true);
    setNote('');
    try {
      await defaultDemoDataService.load();
      await persist((s) => ({ ...s, completed: true, step: 'done' }));
      router.replace('/');
    } catch {
      setNote('演示体验暂未准备好，你可以重试或按正常流程开始。');
    } finally {
      setBusy(false);
    }
  };

  if (!state) return <View style={styles.center}><Text style={styles.muted}>加载中…</Text></View>;

  const step = state.step;
  const itemsCount = items.length;
  const status = quotaStatus(items);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {step === 'welcome' && (
        <Card>
          <Text style={styles.title}>每天 30 秒，穿好再出门</Text>
          <Text style={styles.body}>用 12 件常穿衣物开始，不必整理整个衣柜。无需账号，衣橱数据默认保存在本机。</Text>
          <Primary label="开始" onPress={advanceIntro} />
          <Secondary label={busy ? '正在准备演示…' : '直接体验完整 Demo'} onPress={() => void startDemo()} disabled={busy} />
          {note ? <Text style={styles.note}>{note}</Text> : null}
        </Card>
      )}
      {step === 'value' && (
        <Card>
          <Text style={styles.title}>三步获得价值</Text>
          <Text style={styles.body}>① 拍/选真实衣物 ② 手机本地自动抠图 ③ 得到可解释搭配。原图永不覆盖。</Text>
          <Primary label="下一步" onPress={advanceIntro} />
        </Card>
      )}
      {step === 'privacy' && (
        <Card>
          <Text style={styles.title}>本地优先 · 隐私</Text>
          <Text style={styles.body}>无需注册，衣物、造型和记录默认只在设备。抠图默认在手机本地完成；只有你自己配置并明确同意后，衣物照片才会上传腾讯云进行高质量抠图。本演示版数据仅保存在当前设备。</Text>
          <Primary label="本地开始" onPress={advanceIntro} />
        </Card>
      )}
      {step === 'goals' && (
        <Card>
          <Text style={styles.title}>你的穿搭目标（可多选）</Text>
          <View style={styles.chipRow}>
            {GOALS.map((g) => (
              <Pressable key={g} accessibilityRole="button" onPress={() => toggleGoal(g)} style={[styles.chip, state.goals.includes(g) && styles.chipOn]}>
                <Text style={[styles.chipTxt, state.goals.includes(g) && styles.chipTxtOn]}>{GOAL_LABEL[g]}</Text>
              </Pressable>
            ))}
          </View>
          <Primary label="继续" onPress={advanceIntro} />
        </Card>
      )}
      {step === 'quota' && (
        <Card>
          <Text style={styles.title}>启动包进度 {itemsCount}/{QUOTA_TOTAL}</Text>
          <Text style={styles.body}>
            上装 {status.counts.top}/{QUOTA.top} · 下装 {status.counts.bottom}/{QUOTA.bottom} · 鞋 {status.counts.shoes}/{QUOTA.shoes} · 外套 {status.counts.outerwear}/{QUOTA.outerwear} · 自由 {status.counts.free}/{QUOTA.free}
          </Text>
          <Text style={styles.body}>选择类别后添加真实衣物（连衣裙可顶替上装/下装缺口）：</Text>
          <View style={styles.chipRow}>
            {PICK_CATS.map((c) => (
              <Pressable key={c} accessibilityRole="button" onPress={() => setPickCat(c)} style={[styles.chip, pickCat === c && styles.chipOn]}>
                <Text style={[styles.chipTxt, pickCat === c && styles.chipTxtOn]}>{PICK_LABEL[c]}</Text>
              </Pressable>
            ))}
          </View>
          <Primary label={busy ? '添加中…' : `添加一件${PICK_LABEL[pickCat]}`} onPress={addOne} disabled={busy} />
          {note ? <Text style={styles.note}>{note}</Text> : null}
          {status.missing.length > 0 ? (
            <Text style={styles.body}>仍缺：{status.missing.map((m) => PICK_LABEL[m]).join('、')}</Text>
          ) : null}
          {itemsCount >= 6 && itemsCount < QUOTA_TOTAL ? (
            <Primary label="查看 6 件预览" onPress={() => persist((s) => ({ ...s, step: 'preview' }))} />
          ) : null}
          {itemsCount >= QUOTA_TOTAL ? <Primary label="生成首套搭配" onPress={() => persist((s) => ({ ...s, step: 'reveal' }))} /> : null}
          <Pressable accessibilityRole="button" onPress={() => void finishLater()} style={styles.skip}>
            <Text style={styles.skipTxt}>稍后在衣橱补录</Text>
          </Pressable>
        </Card>
      )}
      {step === 'preview' && (
        <Card>
          <Text style={styles.title}>6 件预览</Text>
          {outfit && outfit.ok ? (
            <Text style={styles.body}>基于已录衣物可组成首套：{outfit.outfit.top.id} + {outfit.outfit.bottom.id} + {outfit.outfit.shoes.id}。继续补到 12 件解锁完整推荐。</Text>
          ) : (
            <Text style={styles.body}>当前衣物尚不足以组成完整搭配，继续添加（尤其鞋/下装）。</Text>
          )}
          <Primary label="继续补到 12 件" onPress={() => persist((s) => ({ ...s, step: 'quota' }))} />
        </Card>
      )}
      {step === 'reveal' && (
        <Card>
          <Text style={styles.title}>你的首套搭配</Text>
          {outfit && outfit.ok ? (
            <>
              <Text style={styles.body}>上装 {outfit.outfit.top.id} · 下装 {outfit.outfit.bottom.id} · 鞋 {outfit.outfit.shoes.id}{outfit.outfit.outerwear ? ` · 外套 ${outfit.outfit.outerwear.id}` : ''}</Text>
              {outfit.outfit.reasons.map((r, i) => (
                <Text key={i} style={styles.reason}>· {r}</Text>
              ))}
            </>
          ) : (
            <Text style={styles.body}>还缺：{outfit && !outfit.ok ? outfit.missing.join(', ') : ''}。补完后即可生成。</Text>
          )}
          <Primary label="进入今日" onPress={finish} disabled={!outfit || !outfit.ok} />
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xxl, backgroundColor: palette.paperWhite },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  muted: { ...typography.body, color: palette.charcoalSoft },
  card: { padding: spacing.lg, backgroundColor: palette.sandSoft, borderRadius: radius.lg, marginTop: spacing.md },
  title: { ...typography.title, color: palette.charcoal },
  body: { ...typography.body, color: palette.charcoalSoft, marginVertical: spacing.sm },
  reason: { ...typography.bodySm, color: palette.oxblood },
  btn: { minHeight: hitTarget.preferred, borderRadius: radius.md, backgroundColor: palette.oxblood, justifyContent: 'center', alignItems: 'center', marginTop: spacing.md },
  btnDisabled: { opacity: 0.5 },
  btnLabel: { ...typography.body, color: palette.white },
  secondaryBtn: { minHeight: hitTarget.preferred, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.oxblood, justifyContent: 'center', alignItems: 'center', marginTop: spacing.sm },
  secondaryBtnLabel: { ...typography.body, color: palette.oxblood },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginVertical: spacing.sm },
  chip: { minHeight: hitTarget.min, paddingHorizontal: spacing.md, justifyContent: 'center', borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.hairline, backgroundColor: palette.white },
  chipOn: { backgroundColor: palette.oxblood, borderColor: palette.oxblood },
  chipTxt: { ...typography.bodySm, color: palette.charcoal },
  chipTxtOn: { color: palette.white },
  note: { ...typography.caption, color: palette.danger, marginTop: spacing.xs },
  skip: { marginTop: spacing.md, alignItems: 'center' },
  skipTxt: { ...typography.bodySm, color: palette.charcoalSoft },
});
