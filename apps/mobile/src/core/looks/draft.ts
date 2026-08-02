import type { LookMode } from '../db/schema';
import type { LookItemGeom } from './geometry';
import { deserializeItems, serializeItems } from './geometry';

/**
 * 画布草稿（MVP-008）：未保存退出/崩溃重启可恢复最近一次编辑。
 * 草稿由 service 层持久化到 dao meta 键 `look_draft`（JSON 字符串）。
 * parseDraft 容错：坏 JSON / 缺字段 / 非法值一律返回 null，不崩、不猜。
 */

export interface LookDraft {
  mode: LookMode;
  name: string;
  items: LookItemGeom[];
  updatedAt: number;
}

export function serializeDraft(draft: LookDraft): string {
  // items 复用几何模块的字段校验语义；整体字段顺序固定，序列化稳定。
  return JSON.stringify({
    mode: draft.mode,
    name: draft.name,
    items: JSON.parse(serializeItems(draft.items)) as LookItemGeom[],
    updatedAt: draft.updatedAt,
  });
}

export function parseDraft(text: string): LookDraft | null {
  try {
    const v: unknown = JSON.parse(text);
    if (typeof v !== 'object' || v == null) return null;
    const o = v as Record<string, unknown>;
    if (o.mode !== 'slots' && o.mode !== 'canvas') return null;
    if (typeof o.name !== 'string') return null;
    if (typeof o.updatedAt !== 'number' || !Number.isFinite(o.updatedAt)) return null;
    if (!Array.isArray(o.items)) return null;
    // 逐元素复用几何校验（缺字段/类型错即整体无效，不部分恢复）
    const items = deserializeItems(JSON.stringify(o.items));
    if (items == null) return null;
    return { mode: o.mode, name: o.name, items, updatedAt: o.updatedAt };
  } catch {
    return null;
  }
}
