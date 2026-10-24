/** @jest-environment node */
import { describe, expect, it } from '@jest/globals';

import type { ShoppingCandidateRow } from '../db/schema';
import { ShoppingServiceCore } from './service';
import { sanitizeShoppingUrl } from './safeUrl';
import {
  SHOPPING_ALGORITHM_VERSION,
  type ShoppingImageIO,
  type ShoppingPixelData,
  type ShoppingRepository,
  type ShoppingWardrobeItem,
} from './types';

function pixels(color: [number, number, number, number]): ShoppingPixelData {
  const width = 12;
  const height = 12;
  const rgba = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index++) rgba.set(color, index * 4);
  return { width, height, rgba };
}

function item(
  id: string,
  category: ShoppingWardrobeItem['category'],
  imageRelPath: string | null,
  status: ShoppingWardrobeItem['status'] = 'clean',
): ShoppingWardrobeItem {
  return {
    id,
    name: `真实衣物 ${id}`,
    category,
    status,
    archivedAt: null,
    createdAt: 1,
    updatedAt: 1,
    lastWornAt: null,
    timesWorn: 0,
    color: 'blue',
    imageRelPath,
  };
}

class MemoryRepository implements ShoppingRepository {
  readonly rows = new Map<string, ShoppingCandidateRow>();

  constructor(readonly wardrobe: ShoppingWardrobeItem[]) {}

  async insertCandidate(row: ShoppingCandidateRow) {
    this.rows.set(row.id, { ...row });
  }

  async updateCandidate(id: string, fields: Partial<ShoppingCandidateRow>) {
    const row = this.rows.get(id);
    if (!row) throw new Error('missing candidate');
    this.rows.set(id, { ...row, ...fields });
  }

  async getCandidate(id: string) {
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }

  async listActiveCandidates() {
    return [...this.rows.values()].filter((row) => row.deletedAt == null).map((row) => ({ ...row }));
  }

  async listWardrobeItems() {
    return this.wardrobe.map((wardrobeItem) => ({ ...wardrobeItem }));
  }
}

class MemoryImageIO implements ShoppingImageIO {
  readonly pixelsByPath = new Map<string, ShoppingPixelData>();
  readonly sourcePixels = new Map<string, ShoppingPixelData>();
  readonly deleted: string[] = [];
  readonly readPaths: string[] = [];
  readonly failNextRead = new Set<string>();
  failDeleteCount = 0;

  async importImage(sourceUri: string, candidateId: string) {
    const source = this.sourcePixels.get(sourceUri);
    if (!source) throw new Error('unreadable source');
    const relPath = `shopping/${candidateId}.jpg`;
    this.pixelsByPath.set(relPath, source);
    return { relPath, sha256: `sha-${candidateId}` };
  }

  async readPixels(relPath: string) {
    this.readPaths.push(relPath);
    if (this.failNextRead.delete(relPath)) throw new Error('interrupted decode');
    const value = this.pixelsByPath.get(relPath);
    if (!value) throw new Error('missing pixels');
    return value;
  }

  async deleteImage(relPath: string) {
    if (this.failDeleteCount > 0) {
      this.failDeleteCount--;
      throw new Error('delete interrupted');
    }
    this.deleted.push(relPath);
    this.pixelsByPath.delete(relPath);
  }
}

function setup(checkpointHook?: (count: number) => Promise<void>) {
  const wardrobe = [
    item('top-c', 'top', 'originals/top-c.jpg'),
    item('top-a', 'top', 'originals/top-a.jpg'),
    item('top-b', 'top', 'originals/top-b.jpg'),
    // 与候选同色同图，但类别不同：必须被硬门禁排除。
    item('blue-shoe', 'shoes', 'originals/blue-shoe.jpg'),
    item('bottom-ok', 'bottom', 'originals/bottom-ok.jpg'),
    item('bottom-laundry', 'bottom', 'originals/bottom-laundry.jpg', 'laundry'),
  ];
  const repository = new MemoryRepository(wardrobe);
  const imageIO = new MemoryImageIO();
  const blue = pixels([20, 70, 220, 255]);
  imageIO.sourcePixels.set('source://candidate', blue);
  for (const wardrobeItem of wardrobe) {
    if (wardrobeItem.imageRelPath) imageIO.pixelsByPath.set(wardrobeItem.imageRelPath, blue);
  }
  let now = 1_000;
  let checkpoints = 0;
  const service = new ShoppingServiceCore(repository, imageIO, {
    id: () => 'candidate-1',
    now: () => ++now,
    checkpoint: async () => {
      checkpoints++;
      await checkpointHook?.(checkpoints);
    },
  });
  return { repository, imageIO, service, wardrobe, checkpointCount: () => checkpoints };
}

describe('ShoppingServiceCore', () => {
  it('保存版本化特征/同类稳定 top3/真实合法组合，并明确成本每次是假设', async () => {
    const { repository, service, wardrobe, checkpointCount } = setup();
    const report = await service.createCandidate({
      sourceUri: 'source://candidate',
      name: '  蓝色候选衬衫  ',
      category: 'top',
      priceMinor: 60_000,
      currency: 'cny',
      productUrl: 'javascript:alert(1)',
      assumedWears: 30,
    });

    expect(report.candidate.name).toBe('蓝色候选衬衫');
    expect(report.candidate.productUrl).toBeNull();
    expect(report.candidate.analysisState).toBe('ready');
    expect(report.similarities.map((result) => result.garmentId)).toEqual(['top-a', 'top-b', 'top-c']);
    expect(report.similarities.every((result) => result.category === 'top')).toBe(true);
    expect(report.similarities.some((result) => result.garmentId === 'blue-shoe')).toBe(false);
    expect(report.similarities[0]?.dimensions.category.explanation).toContain('硬门禁');
    expect(report.costPerWear).toEqual({
      priceMinor: 60_000,
      assumedWears: 30,
      estimatedMinor: 2_000,
      explicitAssumption: true,
    });
    expect(report.compatibleLookCount).toBe(1);
    expect(report.looks[0]?.items.map((lookItem) => lookItem.garmentId).sort()).toEqual([
      'blue-shoe',
      'bottom-ok',
    ]);
    const wardrobeIds = new Set(wardrobe.map((wardrobeItem) => wardrobeItem.id));
    expect(report.looks.flatMap((look) => look.items).every((lookItem) => wardrobeIds.has(lookItem.garmentId))).toBe(true);
    expect(report.looks.flatMap((look) => look.items).some((lookItem) => lookItem.garmentId.includes('candidate'))).toBe(false);

    const stored = repository.rows.get('candidate-1')!;
    expect(JSON.parse(stored.featuresJson!).version).toBe(SHOPPING_ALGORITHM_VERSION);
    expect(JSON.parse(stored.resultsJson).version).toBe(SHOPPING_ALGORITHM_VERSION);
    expect(JSON.parse(stored.compatibilityJson).version).toBe(SHOPPING_ALGORITHM_VERSION);
    const firstSnapshot = stored.resultsJson;
    await service.retryAnalysis('candidate-1');
    expect(repository.rows.get('candidate-1')?.resultsJson).toBe(firstSnapshot);
    expect(checkpointCount()).toBeGreaterThanOrEqual(5);
  });

  it('无图仍保存手工候选，空结果明确为证据不足而非值得买', async () => {
    const repository = new MemoryRepository([]);
    const imageIO = new MemoryImageIO();
    const service = new ShoppingServiceCore(repository, imageIO, { id: () => 'manual', now: () => 1 });
    const report = await service.createCandidate({ name: '手工候选', category: 'other' });
    expect(report.candidate.analysisState).toBe('insufficient_evidence');
    expect(report.similarities).toEqual([]);
    expect(report.evidenceMessage).toContain('不代表值得买');
    expect((await service.listCandidates()).map((candidate) => candidate.id)).toEqual(['manual']);
  });

  it('计算中断保留候选和图片，之后可重试成功', async () => {
    const { service, imageIO } = setup();
    imageIO.failNextRead.add('shopping/candidate-1.jpg');
    const failed = await service.createCandidate({
      sourceUri: 'source://candidate',
      name: '可恢复候选',
      category: 'top',
    });
    expect(failed.candidate.analysisState).toBe('failed');
    expect(failed.candidate.imageRelPath).toBe('shopping/candidate-1.jpg');
    expect(failed.evidenceMessage).toContain('可重试');
    const recovered = await service.retryAnalysis('candidate-1');
    expect(recovered.candidate.analysisState).toBe('ready');
    expect(recovered.similarities).toHaveLength(3);
  });

  it('修改结论/预计穿着次数不改促销排序，删除只墓碑候选和候选图片', async () => {
    const { repository, imageIO, service, wardrobe } = setup();
    const created = await service.createCandidate({
      sourceUri: 'source://candidate',
      name: '候选',
      category: 'top',
      priceMinor: 60_000,
    });
    const beforeOrder = created.similarities.map((result) => result.garmentId);
    const updated = await service.updateCandidate('candidate-1', {
      verdict: 'similar_owned',
      assumedWears: 20,
    });
    expect(updated.candidate.verdict).toBe('similar_owned');
    expect(updated.costPerWear?.estimatedMinor).toBe(3_000);
    expect(updated.similarities.map((result) => result.garmentId)).toEqual(beforeOrder);

    await service.deleteCandidate('candidate-1');
    expect(await service.getCandidateReport('candidate-1')).toBeNull();
    expect(repository.wardrobe).toEqual(wardrobe);
    expect(imageIO.deleted).toEqual(['shopping/candidate-1.jpg']);
    expect(repository.rows.get('candidate-1')?.deletedAt).not.toBeNull();
    expect(repository.rows.get('candidate-1')?.imageRelPath).toBeNull();
  });

  it('读取报告按当前衣橱状态过滤旧相似快照并重算组合；新增衣物需显式 retry 才进相似结果', async () => {
    const { repository, imageIO, service } = setup();
    await service.createCandidate({ sourceUri: 'source://candidate', name: '候选', category: 'top' });
    const readsAfterAnalysis = imageIO.readPaths.length;
    // 三条旧相似：待洗、归档、缺图后都不能继续展示；鞋不可用也令合法组合归零。
    repository.wardrobe.find((entry) => entry.id === 'top-a')!.status = 'laundry';
    repository.wardrobe.find((entry) => entry.id === 'top-b')!.archivedAt = 10;
    repository.wardrobe.find((entry) => entry.id === 'top-c')!.imageRelPath = null;
    repository.wardrobe.find((entry) => entry.id === 'blue-shoe')!.status = 'loaned';
    const fresh = item('top-new', 'top', 'originals/top-new.jpg');
    repository.wardrobe.push(fresh);
    imageIO.pixelsByPath.set(fresh.imageRelPath!, pixels([20, 70, 220, 255]));

    const live = await service.getCandidateReport('candidate-1');
    expect(live?.similarities).toEqual([]);
    expect(live?.compatibleLookCount).toBe(0);
    expect(live?.evidenceMessage).toContain('证据不足');
    expect(imageIO.readPaths).toHaveLength(readsAfterAnalysis); // get 不自动重跑特征

    repository.wardrobe.find((entry) => entry.id === 'blue-shoe')!.status = 'clean';
    const retried = await service.retryAnalysis('candidate-1');
    expect(retried.similarities.map((entry) => entry.garmentId)).toEqual(['top-new']);
    expect(retried.compatibleLookCount).toBe(1);
  });

  it('pending 保留上次快照；durable checkpoint 失败不会伪报图片失败或清空结果', async () => {
    let failAt = Number.POSITIVE_INFINITY;
    const { repository, service } = setup(async (count) => {
      if (count === failAt) throw new Error('durable checkpoint failed');
    });
    await service.createCandidate({ sourceUri: 'source://candidate', name: '候选', category: 'top' });
    const snapshot = repository.rows.get('candidate-1')!.resultsJson;
    failAt = 5; // retry 的 pending checkpoint
    await expect(service.retryAnalysis('candidate-1')).rejects.toThrow('durable checkpoint failed');
    expect(repository.rows.get('candidate-1')?.analysisState).toBe('pending');
    expect(repository.rows.get('candidate-1')?.resultsJson).toBe(snapshot);
    const pending = await service.getCandidateReport('candidate-1');
    expect(pending?.similarities).toHaveLength(3);
    expect(pending?.evidenceMessage).toContain('上次可用快照');

    let failOnFinal = 4;
    const second = setup(async (count) => {
      if (count === failOnFinal) throw new Error('durable final failed');
    });
    await expect(second.service.createCandidate({
      sourceUri: 'source://candidate', name: '候选', category: 'top',
    })).rejects.toThrow('durable final failed');
    const stored = second.repository.rows.get('candidate-1')!;
    expect(stored.analysisState).toBe('ready');
    expect(JSON.parse(stored.resultsJson).items).toHaveLength(3);
    expect(stored.lastError).toBeNull();
    failOnFinal = Number.POSITIVE_INFINITY;
  });

  it('候选图片清理失败不吞错，保留待重试事实；同 id 再删可完成清理', async () => {
    const { repository, imageIO, service } = setup();
    await service.createCandidate({ sourceUri: 'source://candidate', name: '候选', category: 'top' });
    imageIO.failDeleteCount = 1;
    await expect(service.deleteCandidate('candidate-1')).rejects.toThrow(/cleanup is pending/);
    const pending = repository.rows.get('candidate-1')!;
    expect(pending.deletedAt).not.toBeNull();
    expect(pending.imageRelPath).toBe('shopping/candidate-1.jpg');
    expect(pending.lastError).toContain('清理待重试');

    await service.deleteCandidate('candidate-1');
    expect(repository.rows.get('candidate-1')?.imageRelPath).toBeNull();
    expect(repository.rows.get('candidate-1')?.lastError).toBeNull();
    expect(imageIO.deleted).toEqual(['shopping/candidate-1.jpg']);
  });

  it('恶意候选/衣橱路径不会进入 IO 读取', async () => {
    const repository = new MemoryRepository([
      item('safe', 'top', 'originals/safe.jpg'),
      item('evil', 'top', 'file:///etc/passwd'),
    ]);
    const imageIO = new MemoryImageIO();
    imageIO.pixelsByPath.set('shopping/candidate.jpg', pixels([1, 2, 3, 255]));
    imageIO.pixelsByPath.set('originals/safe.jpg', pixels([1, 2, 3, 255]));
    const now = 1;
    const row: ShoppingCandidateRow = {
      id: 'candidate', name: '候选', category: 'top', priceMinor: null, currency: null, productUrl: null,
      imageRelPath: '../outside.jpg', imageSha256: null, algorithmVersion: SHOPPING_ALGORITHM_VERSION,
      featuresJson: null, resultsJson: '[]', compatibilityJson: '[]', assumedWears: 30,
      verdict: 'undecided', analysisState: 'pending', lastError: null, createdAt: now, updatedAt: now, deletedAt: null,
    };
    repository.rows.set(row.id, row);
    const service = new ShoppingServiceCore(repository, imageIO, { now: () => now });
    const report = await service.retryAnalysis('candidate');
    expect(report.candidate.analysisState).toBe('failed');
    expect(imageIO.readPaths).toEqual([]);

    repository.rows.set('candidate', { ...row, imageRelPath: 'shopping/candidate.jpg' });
    const safeReport = await service.retryAnalysis('candidate');
    expect(safeReport.similarities.map((entry) => entry.garmentId)).toEqual(['safe']);
    expect(imageIO.readPaths).not.toContain('file:///etc/passwd');
  });

  it('商品 URL 仅允许无凭证的 http/https，拒绝控制字符和超长输入', () => {
    expect(sanitizeShoppingUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(sanitizeShoppingUrl('http://user:pass@example.com/item')).toBeNull();
    expect(sanitizeShoppingUrl('data:text/html,x')).toBeNull();
    expect(sanitizeShoppingUrl('https://example.com/\njavascript:alert(1)')).toBeNull();
    expect(sanitizeShoppingUrl('https://example.com/item\n')).toBeNull();
    expect(sanitizeShoppingUrl(`https://example.com/${'a'.repeat(2_100)}`)).toBeNull();
  });
});
