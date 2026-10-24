import type { GarmentCategory, GarmentStatus, ShoppingCandidateRow } from '../db/schema';

/** v2：Lab 直方图改为连续软分箱，消除轻微色偏跨硬边界的断崖。 */
export const SHOPPING_ALGORITHM_VERSION = 'shopping-image-v2';
export const DEFAULT_ASSUMED_WEARS = 30;

export type ShoppingVerdict = 'undecided' | 'similar_owned' | 'fills_gap' | 'considering';
export type ShoppingAnalysisState = 'pending' | 'ready' | 'insufficient_evidence' | 'failed';

/** 64-bit dHash + 27-bin Lab histogram + foreground contour summary. */
export interface ShoppingImageFeaturesV1 {
  version: typeof SHOPPING_ALGORITHM_VERSION;
  width: number;
  height: number;
  dHash64: string;
  labHistogram27: number[];
  contour: {
    aspectRatio: number;
    coverage: number;
    centroidX: number;
    centroidY: number;
    edgeDensity: number;
  };
}

export interface ShoppingSimilarityDimension {
  score: number;
  weight: number;
  contribution: number;
  explanation: string;
}

export interface ShoppingSimilarityResult {
  garmentId: string;
  name: string;
  category: GarmentCategory;
  imageRelPath: string;
  totalScore: number;
  /** UI 便捷字段；与 dimensions 内同名 score 完全一致。 */
  hashScore: number;
  labScore: number;
  contourScore: number;
  dimensions: {
    category: ShoppingSimilarityDimension;
    hash: ShoppingSimilarityDimension;
    lab: ShoppingSimilarityDimension;
    contour: ShoppingSimilarityDimension;
  };
  /** 保存被比较衣物的特征快照，保证旧结果可解释/可复现。 */
  garmentFeatures: ShoppingImageFeaturesV1;
}

export type ShoppingCandidateSlot = 'top' | 'bottom' | 'dress' | 'shoes' | 'outerwear';

export interface ShoppingLookItem {
  garmentId: string;
  name: string;
  category: GarmentCategory;
  imageRelPath: string | null;
}

export interface ShoppingCompatibleLook {
  id: string;
  candidateSlot: ShoppingCandidateSlot;
  /** 仅含真实衣橱单品；候选商品本身由 candidateSlot 表示。 */
  items: ShoppingLookItem[];
}

export interface ShoppingCandidate {
  id: string;
  name: string;
  category: GarmentCategory;
  priceMinor: number | null;
  currency: string | null;
  productUrl: string | null;
  imageRelPath: string | null;
  imageSha256: string | null;
  algorithmVersion: string;
  assumedWears: number;
  verdict: ShoppingVerdict;
  analysisState: ShoppingAnalysisState;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface ShoppingCostPerWear {
  priceMinor: number;
  assumedWears: number;
  estimatedMinor: number;
  /** 始终为 true，避免把预估包装成事实。 */
  explicitAssumption: true;
}

export interface ShoppingCandidateReport {
  candidate: ShoppingCandidate;
  similarities: ShoppingSimilarityResult[];
  looks: ShoppingCompatibleLook[];
  compatibleLookCount: number;
  costPerWear: ShoppingCostPerWear | null;
  evidenceMessage: string | null;
}

export type ShoppingCandidateSummary = ShoppingCandidate;

export interface CreateCandidateInput {
  sourceUri?: string | null;
  mimeType?: string | null;
  name: string;
  category: GarmentCategory;
  priceMinor?: number | null;
  currency?: string | null;
  productUrl?: string | null;
  assumedWears?: number;
}

export interface UpdateCandidateInput {
  assumedWears?: number;
  verdict?: ShoppingVerdict;
}

/** Repository 提供给相似/搭配引擎的真实衣橱投影。 */
export interface ShoppingWardrobeItem {
  id: string;
  name: string;
  category: GarmentCategory;
  status: GarmentStatus;
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
  lastWornAt: number | null;
  timesWorn: number;
  color: string | null;
  imageRelPath: string | null;
}

export interface SimilaritySnapshotV1 {
  version: typeof SHOPPING_ALGORITHM_VERSION;
  items: ShoppingSimilarityResult[];
}

export interface CompatibilitySnapshotV1 {
  version: typeof SHOPPING_ALGORITHM_VERSION;
  items: ShoppingCompatibleLook[];
  total: number;
}

export interface ShoppingRepository {
  insertCandidate(row: ShoppingCandidateRow): Promise<void>;
  updateCandidate(id: string, fields: Partial<ShoppingCandidateRow>): Promise<void>;
  getCandidate(id: string): Promise<ShoppingCandidateRow | null>;
  listActiveCandidates(): Promise<ShoppingCandidateRow[]>;
  listWardrobeItems(): Promise<ShoppingWardrobeItem[]>;
}

export interface ShoppingPixelData {
  width: number;
  height: number;
  rgba: Uint8Array;
}

export interface ShoppingImageImport {
  relPath: string;
  sha256: string;
}

export interface ShoppingImageIO {
  importImage(sourceUri: string, candidateId: string, mimeType?: string | null): Promise<ShoppingImageImport>;
  readPixels(relPath: string): Promise<ShoppingPixelData>;
  deleteImage(relPath: string): Promise<void>;
}
