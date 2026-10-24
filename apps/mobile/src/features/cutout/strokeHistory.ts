import type { MaskStrokeRow } from '@/core/db/schema';
import {
  appendStroke,
  removeLastStrokeRow,
  type AnyDb,
} from '@/core/db/queue';

/** 当前编辑会话的 redo 栈；每次撤销同时从 SQLite 移除，重做时原行原样写回。 */
export class StrokeRedoHistory {
  private rows: MaskStrokeRow[] = [];

  get count(): number {
    return this.rows.length;
  }

  rememberUndo(row: MaskStrokeRow): void {
    this.rows.push(row);
  }

  takeRedo(): MaskStrokeRow | null {
    return this.rows.pop() ?? null;
  }

  restoreFailedRedo(row: MaskStrokeRow): void {
    this.rows.push(row);
  }

  clearForNewStroke(): void {
    this.rows = [];
  }
}

export async function undoStroke(
  db: AnyDb,
  garmentId: string,
  history: StrokeRedoHistory,
): Promise<MaskStrokeRow | null> {
  const row = await removeLastStrokeRow(db, garmentId);
  if (row) history.rememberUndo(row);
  return row;
}

export async function redoStroke(db: AnyDb, history: StrokeRedoHistory): Promise<MaskStrokeRow | null> {
  const row = history.takeRedo();
  if (!row) return null;
  try {
    await appendStroke(db, row);
    return row;
  } catch (error) {
    history.restoreFailedRedo(row);
    throw error;
  }
}
