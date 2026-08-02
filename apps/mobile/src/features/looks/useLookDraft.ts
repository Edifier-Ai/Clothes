import { useEffect, useRef, useState } from 'react';

import type { LookMode } from '@/core/db/schema';
import type { LookDraft } from '@/core/looks/draft';
import type { LookItemGeom } from '@/core/looks/geometry';
import { clearDraft, loadDraft, saveDraft } from '@/core/looks/lookService';

const DEBOUNCE_MS = 800;

export interface UseLookDraftArgs {
  mode: LookMode;
  name: string;
  items: readonly LookItemGeom[];
  /** 恢复草稿：由编辑器把 items/name 灌回自身状态。 */
  onRestore: (draft: LookDraft) => void;
}

export interface LookDraftController {
  /** 有待恢复草稿时非 null（UI 显示「恢复上次未保存的造型？」）。 */
  pendingDraft: LookDraft | null;
  acceptDraft: () => void;
  dismissDraft: () => void;
  /** 保存成功后调用：清草稿并阻止 unmount 时回写。 */
  markSaved: () => Promise<void>;
}

/**
 * 画布/快速槽位草稿（MVP-008）：
 * - 挂载时 loadDraft，同 mode 草稿提示恢复；
 * - items/name 有内容即视为改动，防抖 800ms 自动 saveDraft，unmount 时补一次；
 * - 保存成功 markSaved → clearDraft；放弃恢复 → clearDraft。
 * 草稿允许丢（meta 不入镜像），正式造型绝不丢。
 */
export function useLookDraft({ mode, name, items, onRestore }: UseLookDraftArgs): LookDraftController {
  const [pendingDraft, setPendingDraft] = useState<LookDraft | null>(null);
  const savedRef = useRef(false);
  const onRestoreRef = useRef(onRestore);
  useEffect(() => {
    onRestoreRef.current = onRestore;
  }, [onRestore]);

  // 挂载时读取一次草稿
  useEffect(() => {
    let mounted = true;
    loadDraft()
      .then((d) => {
        if (mounted && d && d.mode === mode) setPendingDraft(d);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [mode]);

  const dirty = items.length > 0 || name.trim() !== '';
  const latestRef = useRef<LookDraft | null>(null);

  // 改动防抖保存
  useEffect(() => {
    if (!dirty || savedRef.current) return;
    const draft: LookDraft = { mode, name, items: items.map((it) => ({ ...it })), updatedAt: Date.now() };
    latestRef.current = draft;
    const timer = setTimeout(() => {
      saveDraft(draft).catch(() => undefined);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [mode, name, items, dirty]);

  // unmount 时补写最新状态（崩溃/退出保留最近草稿）
  useEffect(
    () => () => {
      if (!savedRef.current && latestRef.current) {
        saveDraft({ ...latestRef.current, updatedAt: Date.now() }).catch(() => undefined);
      }
    },
    [],
  );

  return {
    pendingDraft,
    acceptDraft: () => {
      if (!pendingDraft) return;
      onRestoreRef.current(pendingDraft);
      setPendingDraft(null);
    },
    dismissDraft: () => {
      setPendingDraft(null);
      clearDraft().catch(() => undefined);
    },
    markSaved: async () => {
      savedRef.current = true;
      await clearDraft().catch(() => undefined);
    },
  };
}
