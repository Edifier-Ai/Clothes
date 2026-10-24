import {
  createCandidate,
  deleteCandidate,
  getCandidateReport,
  listCandidates,
  retryAnalysis,
  shoppingImageUri,
  updateCandidate,
  type CreateCandidateInput,
  type ShoppingCandidateReport,
  type ShoppingCandidateSummary,
} from '@/core/shopping/service';

/**
 * 购物页面只依赖这层窄接口，算法、SQLite 与文件持久化留在 core。
 * 测试可注入内存实现，页面不会为了展示而伪造相似款或造型。
 */
export interface ShoppingService {
  createCandidate(input: CreateCandidateInput): Promise<ShoppingCandidateReport>;
  getCandidateReport(id: string): Promise<ShoppingCandidateReport | null>;
  listCandidates(): Promise<ShoppingCandidateSummary[]>;
  retryAnalysis(id: string): Promise<ShoppingCandidateReport>;
  updateCandidate(
    id: string,
    patch: { assumedWears?: number; verdict?: ShoppingCandidateReport['candidate']['verdict'] },
  ): Promise<ShoppingCandidateReport>;
  deleteCandidate(id: string): Promise<void>;
  shoppingImageUri(relPath: string): string;
}

export const shoppingService: ShoppingService = {
  createCandidate,
  getCandidateReport,
  listCandidates,
  retryAnalysis,
  updateCandidate,
  deleteCandidate,
  shoppingImageUri,
};

export type { CreateCandidateInput, ShoppingCandidateReport, ShoppingCandidateSummary };
