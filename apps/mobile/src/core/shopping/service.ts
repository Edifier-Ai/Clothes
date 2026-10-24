import type { GarmentCategory, ShoppingCandidateRow } from '../db/schema';
import { createServiceRuntime } from '../db/serviceRuntime';
import { originalUri } from '../files/uri';
import { uuidv7 } from '../id/uuidv7';
import { isAvailable } from '../recommend';
import { buildShoppingCompatibleLooks } from './compatibility';
import { createDeviceShoppingImageIO } from './deviceImageIO';
import { extractShoppingImageFeatures } from './features';
import { createDrizzleShoppingRepository } from './repository';
import {
  assertSafeCandidateImagePath,
  assertSafeWardrobeImagePath,
  isSafeWardrobeImagePath,
} from './paths';
import { sanitizeShoppingUrl } from './safeUrl';
import { compareShoppingImage, sortShoppingSimilarities } from './similarity';
import {
  DEFAULT_ASSUMED_WEARS,
  SHOPPING_ALGORITHM_VERSION,
  type CompatibilitySnapshotV1,
  type CreateCandidateInput,
  type ShoppingAnalysisState,
  type ShoppingCandidate,
  type ShoppingCandidateReport,
  type ShoppingCandidateSummary,
  type ShoppingImageIO,
  type ShoppingRepository,
  type ShoppingSimilarityResult,
  type ShoppingVerdict,
  type SimilaritySnapshotV1,
  type UpdateCandidateInput,
} from './types';

export * from './types';
export { extractShoppingImageFeatures } from './features';
export { sanitizeShoppingUrl } from './safeUrl';

const VALID_CATEGORIES = new Set<GarmentCategory>([
  'top',
  'bottom',
  'dress',
  'shoes',
  'outerwear',
  'accessory',
  'other',
]);
const VALID_VERDICTS = new Set<ShoppingVerdict>([
  'undecided',
  'similar_owned',
  'fills_gap',
  'considering',
]);

interface ShoppingCoreOptions {
  id?: () => string;
  now?: () => number;
  /** 每次持久状态切换后的耐久 checkpoint；设备侧接 writeMirror，测试默认 no-op。 */
  checkpoint?: () => Promise<void>;
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function candidateFromRow(row: ShoppingCandidateRow): ShoppingCandidate {
  return {
    id: row.id,
    name: row.name,
    category: row.category as GarmentCategory,
    priceMinor: row.priceMinor,
    currency: row.currency,
    productUrl: row.productUrl,
    imageRelPath: row.imageRelPath,
    imageSha256: row.imageSha256,
    algorithmVersion: row.algorithmVersion,
    assumedWears: row.assumedWears,
    verdict: row.verdict as ShoppingVerdict,
    analysisState: row.analysisState as ShoppingAnalysisState,
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

interface ReportOverrides {
  similarities?: ShoppingSimilarityResult[];
  compatibility?: CompatibilitySnapshotV1;
}

function reportFromRow(row: ShoppingCandidateRow, overrides: ReportOverrides = {}): ShoppingCandidateReport {
  const similarity = parseJson<SimilaritySnapshotV1 | ShoppingSimilarityResult[]>(row.resultsJson, {
    version: SHOPPING_ALGORITHM_VERSION,
    items: [],
  });
  const compatibility = parseJson<CompatibilitySnapshotV1 | CompatibilitySnapshotV1['items']>(
    row.compatibilityJson,
    { version: SHOPPING_ALGORITHM_VERSION, items: [], total: 0 },
  );
  const similarities = overrides.similarities ?? (Array.isArray(similarity) ? similarity : similarity.items);
  const looks = overrides.compatibility?.items ?? (Array.isArray(compatibility) ? compatibility : compatibility.items);
  const compatibleLookCount =
    overrides.compatibility?.total ?? (Array.isArray(compatibility) ? compatibility.length : compatibility.total);
  const costPerWear =
    row.priceMinor == null
      ? null
      : {
          priceMinor: row.priceMinor,
          assumedWears: row.assumedWears,
          estimatedMinor: Math.round(row.priceMinor / row.assumedWears),
          explicitAssumption: true as const,
        };
  let evidenceMessage: string | null = null;
  if (row.analysisState === 'failed') {
    evidenceMessage = row.lastError || '图片分析失败，可重试；没有结果不代表值得买。';
  } else if (row.analysisState === 'pending') {
    evidenceMessage = similarities.length > 0
      ? '正在重新分析，当前展示上次可用快照。'
      : '正在分析，暂时没有可用相似证据。';
  } else if (!row.imageRelPath) {
    evidenceMessage = '未提供可读图片，相似度不可用；没有结果不代表值得买。';
  } else if (similarities.length === 0) {
    evidenceMessage = '衣橱中没有可比较的同类图片，证据不足；没有结果不代表值得买。';
  }
  return { candidate: candidateFromRow(row), similarities, looks, compatibleLookCount, costPerWear, evidenceMessage };
}

function validateAssumedWears(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 10_000) {
    throw new Error('assumedWears must be an integer between 1 and 10000');
  }
  return value;
}

function validatePrice(value: number | null | undefined): number | null {
  if (value == null) return null;
  if (!Number.isInteger(value) || value < 0) throw new Error('priceMinor must be a non-negative integer');
  return value;
}

function safeErrorMessage(prefix: string, _error: unknown): string {
  // 原生错误常含 content/file URI；不把用户本地路径写入数据库或 UI。
  return prefix;
}

/** 可注入的 MVP-012 领域服务；不依赖设备全局，host 测试可使用内存 repository/image IO。 */
export class ShoppingServiceCore {
  private readonly makeId: () => string;
  private readonly now: () => number;
  private readonly checkpoint: () => Promise<void>;

  constructor(
    private readonly repository: ShoppingRepository,
    private readonly imageIO: ShoppingImageIO,
    options: ShoppingCoreOptions = {},
  ) {
    this.makeId = options.id ?? uuidv7;
    this.now = options.now ?? Date.now;
    this.checkpoint = options.checkpoint ?? (async () => undefined);
  }

  private async activeRow(id: string): Promise<ShoppingCandidateRow> {
    const row = await this.repository.getCandidate(id);
    if (!row || row.deletedAt != null) throw new Error(`shopping candidate not found: ${id}`);
    return row;
  }

  /**
   * 读取时用当前 active wardrobe 重校验旧快照：状态/归档/删除/图片变化立即生效，
   * 但不为后来新增的衣物自动读取图片或重跑特征（需用户显式 retryAnalysis）。
   */
  private async liveReport(row: ShoppingCandidateRow): Promise<ShoppingCandidateReport> {
    const wardrobe = (await this.repository.listWardrobeItems()).map((item) => ({
      ...item,
      imageRelPath:
        item.imageRelPath && isSafeWardrobeImagePath(item.imageRelPath) ? item.imageRelPath : null,
    }));
    const currentById = new Map(
      wardrobe
        .filter((item) => isAvailable(item) && item.category === row.category && item.imageRelPath != null)
        .map((item) => [item.id, item] as const),
    );
    const snapshot = parseJson<SimilaritySnapshotV1 | ShoppingSimilarityResult[]>(row.resultsJson, {
      version: SHOPPING_ALGORITHM_VERSION,
      items: [],
    });
    const stored = Array.isArray(snapshot) ? snapshot : snapshot.items;
    const similarities = stored
      .flatMap((result) => {
        const current = currentById.get(result.garmentId);
        if (!current?.imageRelPath) return [];
        return [{
          ...result,
          name: current.name,
          category: current.category,
          imageRelPath: current.imageRelPath,
        }];
      })
      .slice(0, 3);
    const liveCompatibility = buildShoppingCompatibleLooks(row.id, row.category as GarmentCategory, wardrobe);
    return reportFromRow(row, {
      similarities,
      compatibility: {
        version: SHOPPING_ALGORITHM_VERSION,
        items: liveCompatibility.previews,
        total: liveCompatibility.total,
      },
    });
  }

  async createCandidate(input: CreateCandidateInput): Promise<ShoppingCandidateReport> {
    const name = input.name.trim();
    if (!name) throw new Error('candidate name is required');
    if (!VALID_CATEGORIES.has(input.category)) throw new Error(`unsupported category: ${input.category}`);
    const priceMinor = validatePrice(input.priceMinor);
    const assumedWears = validateAssumedWears(input.assumedWears ?? DEFAULT_ASSUMED_WEARS);
    const now = this.now();
    const id = this.makeId();
    const row: ShoppingCandidateRow = {
      id,
      name: name.slice(0, 120),
      category: input.category,
      priceMinor,
      currency: input.currency?.trim().toUpperCase().slice(0, 8) || null,
      productUrl: sanitizeShoppingUrl(input.productUrl),
      imageRelPath: null,
      imageSha256: null,
      algorithmVersion: SHOPPING_ALGORITHM_VERSION,
      featuresJson: null,
      resultsJson: JSON.stringify({ version: SHOPPING_ALGORITHM_VERSION, items: [] } satisfies SimilaritySnapshotV1),
      compatibilityJson: JSON.stringify({
        version: SHOPPING_ALGORITHM_VERSION,
        items: [],
        total: 0,
      } satisfies CompatibilitySnapshotV1),
      assumedWears,
      verdict: 'undecided',
      analysisState: 'pending',
      lastError: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await this.repository.insertCandidate(row);
    // 先把手工信息变成耐久事实，再碰不可信/可能损坏的图片。
    await this.checkpoint();

    if (input.sourceUri) {
      let imported: Awaited<ReturnType<ShoppingImageIO['importImage']>>;
      try {
        imported = await this.imageIO.importImage(input.sourceUri, id, input.mimeType);
        assertSafeCandidateImagePath(imported.relPath);
      } catch (error) {
        const wardrobe = await this.repository.listWardrobeItems();
        const compatibility = buildShoppingCompatibleLooks(id, input.category, wardrobe);
        await this.repository.updateCandidate(id, {
          analysisState: 'insufficient_evidence',
          lastError: safeErrorMessage('图片导入失败，已保留手工信息', error),
          compatibilityJson: JSON.stringify({
            version: SHOPPING_ALGORITHM_VERSION,
            items: compatibility.previews,
            total: compatibility.total,
          } satisfies CompatibilitySnapshotV1),
          updatedAt: this.now(),
        });
        await this.checkpoint();
        return this.liveReport(await this.activeRow(id));
      }
      await this.repository.updateCandidate(id, {
        imageRelPath: imported.relPath,
        imageSha256: imported.sha256,
        updatedAt: this.now(),
      });
      // durable checkpoint 明确位于图片导入 catch 之外；失败必须向上抛，不能伪报“图片失败”。
      await this.checkpoint();
    }
    return this.retryAnalysis(id);
  }

  async getCandidateReport(id: string): Promise<ShoppingCandidateReport | null> {
    const row = await this.repository.getCandidate(id);
    return !row || row.deletedAt != null ? null : this.liveReport(row);
  }

  async listCandidates(): Promise<ShoppingCandidateSummary[]> {
    return (await this.repository.listActiveCandidates()).map(candidateFromRow);
  }

  async retryAnalysis(id: string): Promise<ShoppingCandidateReport> {
    const row = await this.activeRow(id);
    const wardrobe = await this.repository.listWardrobeItems();
    const compatible = buildShoppingCompatibleLooks(id, row.category as GarmentCategory, wardrobe);
    const compatibility: CompatibilitySnapshotV1 = {
      version: SHOPPING_ALGORITHM_VERSION,
      items: compatible.previews,
      total: compatible.total,
    };
    await this.repository.updateCandidate(id, {
      algorithmVersion: SHOPPING_ALGORITHM_VERSION,
      analysisState: 'pending',
      lastError: null,
      compatibilityJson: JSON.stringify(compatibility),
      updatedAt: this.now(),
    });
    // 如果计算中断，pending 草稿与图片路径都已在镜像中，用户可安全重试。
    await this.checkpoint();

    if (!row.imageRelPath) {
      await this.repository.updateCandidate(id, {
        featuresJson: null,
        resultsJson: JSON.stringify({
          version: SHOPPING_ALGORITHM_VERSION,
          items: [],
        } satisfies SimilaritySnapshotV1),
        analysisState: 'insufficient_evidence',
        updatedAt: this.now(),
      });
      await this.checkpoint();
      return this.liveReport(await this.activeRow(id));
    }

    let candidateFeatures: ReturnType<typeof extractShoppingImageFeatures>;
    let items: ShoppingSimilarityResult[];
    try {
      assertSafeCandidateImagePath(row.imageRelPath);
      candidateFeatures = extractShoppingImageFeatures(await this.imageIO.readPixels(row.imageRelPath));
      const comparisons: ShoppingSimilarityResult[] = [];
      for (const item of wardrobe) {
        if (!isAvailable(item) || item.category !== row.category || !item.imageRelPath) continue;
        try {
          assertSafeWardrobeImagePath(item.imageRelPath);
          const features = extractShoppingImageFeatures(await this.imageIO.readPixels(item.imageRelPath));
          const result = compareShoppingImage(row.category as GarmentCategory, candidateFeatures, { item, features });
          if (result) comparisons.push(result);
        } catch {
          // 一件损坏的衣橱派生图不能让整个候选失败；跳过并由“证据不足”状态如实表达。
        }
      }
      items = sortShoppingSimilarities(comparisons).slice(0, 3);
    } catch (error) {
      await this.repository.updateCandidate(id, {
        featuresJson: null,
        resultsJson: JSON.stringify({
          version: SHOPPING_ALGORITHM_VERSION,
          items: [],
        } satisfies SimilaritySnapshotV1),
        compatibilityJson: JSON.stringify(compatibility),
        analysisState: 'failed',
        lastError: safeErrorMessage('图片分析失败，可重试', error),
        updatedAt: this.now(),
      });
      await this.checkpoint();
      return this.liveReport(await this.activeRow(id));
    }

    await this.repository.updateCandidate(id, {
      featuresJson: JSON.stringify(candidateFeatures),
      resultsJson: JSON.stringify({ version: SHOPPING_ALGORITHM_VERSION, items } satisfies SimilaritySnapshotV1),
      compatibilityJson: JSON.stringify(compatibility),
      analysisState: items.length > 0 ? 'ready' : 'insufficient_evidence',
      lastError: null,
      updatedAt: this.now(),
    });
    // durable 失败不进入图片 catch；已计算快照保持原样，调用方收到真实持久化错误。
    await this.checkpoint();
    return this.liveReport(await this.activeRow(id));
  }

  async updateCandidate(id: string, input: UpdateCandidateInput): Promise<ShoppingCandidateReport> {
    await this.activeRow(id);
    const fields: Partial<ShoppingCandidateRow> = { updatedAt: this.now() };
    if (input.assumedWears !== undefined) fields.assumedWears = validateAssumedWears(input.assumedWears);
    if (input.verdict !== undefined) {
      if (!VALID_VERDICTS.has(input.verdict)) throw new Error(`unsupported verdict: ${input.verdict}`);
      fields.verdict = input.verdict;
    }
    await this.repository.updateCandidate(id, fields);
    await this.checkpoint();
    return this.liveReport(await this.activeRow(id));
  }

  async deleteCandidate(id: string): Promise<void> {
    const row = await this.repository.getCandidate(id);
    if (!row) throw new Error(`shopping candidate not found: ${id}`);
    if (row.deletedAt == null) {
      const now = this.now();
      await this.repository.updateCandidate(id, { deletedAt: now, updatedAt: now });
      await this.checkpoint();
    }
    if (!row.imageRelPath) {
      // 允许上一次“清文件后 checkpoint 失败”的同 id 重试推进镜像。
      if (row.deletedAt != null) await this.checkpoint();
      return;
    }
    try {
      assertSafeCandidateImagePath(row.imageRelPath);
      await this.imageIO.deleteImage(row.imageRelPath);
    } catch (error) {
      await this.repository.updateCandidate(id, {
        lastError: safeErrorMessage('候选已删除，图片清理待重试', error),
        updatedAt: this.now(),
      });
      await this.checkpoint();
      throw new Error('candidate deleted but image cleanup is pending');
    }
    await this.repository.updateCandidate(id, {
      imageRelPath: null,
      imageSha256: null,
      lastError: null,
      updatedAt: this.now(),
    });
    await this.checkpoint();
  }
}

/* ---------------- 设备单例 ---------------- */

const rt = createServiceRuntime();
let deviceCoreHolder: Promise<ShoppingServiceCore> | null = null;

function deviceCore(): Promise<ShoppingServiceCore> {
  if (!deviceCoreHolder) {
    deviceCoreHolder = rt.readyDb().then(
      (app) =>
        new ShoppingServiceCore(
          createDrizzleShoppingRepository(app.drizzleDb),
          createDeviceShoppingImageIO(rt.root()),
          { checkpoint: () => rt.persist() },
        ),
    );
  }
  return deviceCoreHolder;
}

export async function createCandidate(input: CreateCandidateInput): Promise<ShoppingCandidateReport> {
  return (await deviceCore()).createCandidate(input);
}

export async function getCandidateReport(id: string): Promise<ShoppingCandidateReport | null> {
  return (await deviceCore()).getCandidateReport(id);
}

export async function listCandidates(): Promise<ShoppingCandidateSummary[]> {
  return (await deviceCore()).listCandidates();
}

export async function retryAnalysis(id: string): Promise<ShoppingCandidateReport> {
  return (await deviceCore()).retryAnalysis(id);
}

export async function updateCandidate(
  id: string,
  input: UpdateCandidateInput,
): Promise<ShoppingCandidateReport> {
  return (await deviceCore()).updateCandidate(id, input);
}

export async function deleteCandidate(id: string): Promise<void> {
  return (await deviceCore()).deleteCandidate(id);
}

export function shoppingImageUri(relPath: string): string {
  assertSafeCandidateImagePath(relPath);
  return originalUri(relPath);
}

/** 仅测试/调试：重置单例，不删除候选或衣橱数据。 */
export function __resetForTest(): void {
  deviceCoreHolder = null;
  rt.resetForTest();
}
