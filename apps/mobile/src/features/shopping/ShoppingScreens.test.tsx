/** @jest-environment node */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import type { CreateCandidateInput } from '@/core/shopping/types';
import ShoppingCandidateScreen from './ShoppingCandidateScreen';
import ShoppingSimilarityScreen from './ShoppingSimilarityScreen';
import ShoppingReportScreen from './ShoppingReportScreen';
import type { ShoppingCandidateReport, ShoppingService } from './shoppingService';
import { validateProductUrl } from './validation';

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  const router = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
  return {
    __router: router,
    useRouter: () => router,
    useLocalSearchParams: () => ({ id: 'route-candidate' }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useFocusEffect: (cb: () => void) => React.useEffect(() => cb(), []),
  };
});

jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: () => Promise.resolve({ canceled: true, assets: [] }),
}));

// 页面测试注入 ShoppingService；默认单例不触达 SQLite / 文件系统原生层。
jest.mock('@/core/shopping/service', () => ({
  createCandidate: () => Promise.reject(new Error('not injected')),
  getCandidateReport: () => Promise.resolve(null),
  listCandidates: () => Promise.resolve([]),
  retryAnalysis: () => Promise.reject(new Error('not injected')),
  updateCandidate: () => Promise.reject(new Error('not injected')),
  deleteCandidate: () => Promise.reject(new Error('not injected')),
  shoppingImageUri: (relPath: string) => `file:///shopping/${relPath}`,
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const routerMock = require('expo-router').__router as {
  push: jest.Mock;
  replace: jest.Mock;
  back: jest.Mock;
};

function candidate(overrides: Partial<ShoppingCandidateReport['candidate']> = {}): ShoppingCandidateReport['candidate'] {
  return {
    id: 'candidate-1',
    name: '深蓝短夹克',
    category: 'outerwear',
    priceMinor: 99900,
    currency: 'CNY',
    productUrl: 'https://shop.example/item/1',
    imageRelPath: 'shopping/candidate-1.jpg',
    imageSha256: 'abc',
    algorithmVersion: 'shopping-image-v2',
    assumedWears: 30,
    verdict: 'undecided',
    analysisState: 'ready',
    lastError: null,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    ...overrides,
  };
}

function similarity(index: number): ShoppingCandidateReport['similarities'][number] {
  const score = 0.9 - index * 0.1;
  const dimension = (value: number, weight: number, explanation: string) => ({
    score: value,
    weight,
    contribution: value * weight,
    explanation,
  });
  return {
    garmentId: `garment-real-${index}`,
    name: ['真丝衬衫', '棉质衬衫', '亚麻衬衫'][index - 1] ?? `真实衣物 ${index}`,
    category: 'outerwear',
    imageRelPath: `originals/garment-${index}.jpg`,
    totalScore: score,
    hashScore: score,
    labScore: score - 0.05,
    contourScore: score - 0.1,
    dimensions: {
      category: dimension(1, 0, '同类门槛通过'),
      hash: dimension(score, 0.45, '感知结构'),
      lab: dimension(score - 0.05, 0.35, 'Lab 色彩'),
      contour: dimension(score - 0.1, 0.2, '轮廓'),
    },
    garmentFeatures: {
      version: 'shopping-image-v2',
      width: 8,
      height: 8,
      dHash64: '0'.repeat(16),
      labHistogram27: Array.from({ length: 27 }, () => 0),
      contour: { aspectRatio: 1, coverage: 0.5, centroidX: 0.5, centroidY: 0.5, edgeDensity: 0.2 },
    },
  };
}

function look(index: number): ShoppingCandidateReport['looks'][number] {
  return {
    id: `look-${index}`,
    candidateSlot: 'outerwear',
    items: [
      {
        garmentId: `look-${index}-top-id`,
        name: `第 ${index} 套上装`,
        category: 'top',
        imageRelPath: `originals/look-${index}-top.jpg`,
      },
      {
        garmentId: `look-${index}-shoes-id`,
        name: `第 ${index} 套鞋`,
        category: 'shoes',
        imageRelPath: null,
      },
    ],
  };
}

function report(overrides: Partial<ShoppingCandidateReport> = {}): ShoppingCandidateReport {
  return {
    candidate: candidate(),
    similarities: [similarity(1), similarity(2), similarity(3)],
    looks: [look(1), look(2), look(3), look(4)],
    compatibleLookCount: 4,
    costPerWear: { priceMinor: 99900, assumedWears: 30, estimatedMinor: 3330, explicitAssumption: true },
    evidenceMessage: null,
    ...overrides,
  };
}

function makeService(overrides: Partial<ShoppingService> = {}): ShoppingService {
  const value = report();
  return {
    createCandidate: async () => value,
    getCandidateReport: async () => value,
    listCandidates: async () => [],
    retryAnalysis: async () => value,
    updateCandidate: async () => value,
    deleteCandidate: async () => undefined,
    shoppingImageUri: (relPath) => `file:///shopping/${relPath}`,
    ...overrides,
  };
}

describe('购物守门三屏（SHP-01..03）', () => {
  beforeEach(() => {
    routerMock.push.mockClear();
    routerMock.replace.mockClear();
    routerMock.back.mockClear();
  });

  it('SHP-01 拒绝恶意商品链接，表单内容与候选列表仍保留', async () => {
    const createCandidate = jest.fn(async (_input: CreateCandidateInput) => report());
    const service = makeService({ createCandidate });
    render(<ShoppingCandidateScreen service={service} />);

    expect(screen.getByRole('button', { name: '从相册选择商品图片' })).toBeOnTheScreen();
    await screen.findByText('还没有候选。保存后可随时回来继续比较。');
    fireEvent.changeText(screen.getByLabelText('名称'), '可疑链接候选');
    fireEvent.changeText(screen.getByLabelText('商品链接 · 可选'), 'javascript:alert(1)');
    fireEvent.press(screen.getByRole('button', { name: '检查衣橱证据' }));

    expect(screen.getByText('只接受 http 或 https 商品链接。')).toBeOnTheScreen();
    expect(screen.getByDisplayValue('可疑链接候选')).toBeOnTheScreen();
    expect(createCandidate).not.toHaveBeenCalled();
  });

  it('SHP-01 无图也能保存候选，并进入真实候选的相似证据页', async () => {
    const created = report({
      candidate: candidate({ id: 'candidate-created', imageRelPath: null, analysisState: 'insufficient_evidence' }),
      similarities: [],
    });
    const createCandidate = jest.fn(async (_input: CreateCandidateInput) => created);
    render(<ShoppingCandidateScreen service={makeService({ createCandidate })} />);
    await screen.findByText('还没有候选。保存后可随时回来继续比较。');

    fireEvent.changeText(screen.getByLabelText('名称'), '无图候选');
    fireEvent.changeText(screen.getByLabelText('商品链接 · 可选'), 'https://shop.example/item');
    fireEvent.press(screen.getByRole('button', { name: '检查衣橱证据' }));

    await waitFor(() => expect(createCandidate).toHaveBeenCalledWith(expect.objectContaining({ sourceUri: null, name: '无图候选' })));
    expect(routerMock.push).toHaveBeenCalledWith('/shopping/candidate-created/similar');
  });

  it('SHP-01 提前说明配饰与其他类别暂不枚举标准穿搭', async () => {
    render(<ShoppingCandidateScreen service={makeService()} />);
    await screen.findByText('还没有候选。保存后可随时回来继续比较。');
    fireEvent.press(screen.getByRole('button', { name: '类别 配饰' }));
    expect(screen.getByText('当前类别的组合证据有限')).toBeOnTheScreen();
    expect(screen.getByText(/暂不枚举配饰或其他类别的完整穿搭/)).toBeOnTheScreen();
  });

  it('SHP-02 只展示同类稳定前三名，并用真实 garment id 打开详情', async () => {
    render(<ShoppingSimilarityScreen candidateId="candidate-1" service={makeService()} />);

    expect(await screen.findByText('真丝衬衫')).toBeOnTheScreen();
    expect(screen.getByText('棉质衬衫')).toBeOnTheScreen();
    expect(screen.getByText('亚麻衬衫')).toBeOnTheScreen();
    expect(screen.getAllByText('同类门槛 · 外套')).toHaveLength(3);
    expect(screen.getAllByText(/权重/)).toHaveLength(12);
    expect(screen.getAllByText('· 同类门槛通过')).toHaveLength(3);
    expect(screen.queryByText('garment-real-1')).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: '查看衣物 真丝衬衫' }));
    expect(routerMock.push).toHaveBeenCalledWith('/garment/garment-real-1');
  });

  it('SHP-02 无图或无同类时明确证据不足，不输出值得买结论', async () => {
    const insufficient = report({
      candidate: candidate({ imageRelPath: null, analysisState: 'insufficient_evidence' }),
      similarities: [],
      evidenceMessage: '没有商品图，无法计算图像相似度。',
    });
    render(<ShoppingSimilarityScreen candidateId="candidate-1" service={makeService({ getCandidateReport: async () => insufficient })} />);

    expect(await screen.findByText('证据不足')).toBeOnTheScreen();
    expect(screen.getByText('没有商品图，无法计算图像相似度。')).toBeOnTheScreen();
    expect(screen.queryByText(/值得买/)).toBeNull();
  });

  it('SHP-02 读取失败可重试，候选不丢失', async () => {
    const getCandidateReport = jest
      .fn<ShoppingService['getCandidateReport']>()
      .mockRejectedValueOnce(new Error('read failed'))
      .mockResolvedValue(report());
    render(<ShoppingSimilarityScreen candidateId="candidate-1" service={makeService({ getCandidateReport })} />);

    expect(await screen.findByText('读取未完成')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByText('真丝衬衫')).toBeOnTheScreen();
    expect(getCandidateReport).toHaveBeenCalledTimes(2);
  });

  it('SHP-02 pending 候选通过 retryAnalysis 真正恢复分析', async () => {
    const pending = report({
      candidate: candidate({ analysisState: 'pending' }),
      similarities: [],
    });
    const retryAnalysis = jest.fn(async () => report());
    render(
      <ShoppingSimilarityScreen
        candidateId="candidate-1"
        service={makeService({ getCandidateReport: async () => pending, retryAnalysis })}
      />,
    );

    expect(await screen.findByText('正在分析')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: '继续分析' }));
    expect(await screen.findByText('真丝衬衫')).toBeOnTheScreen();
    expect(retryAnalysis).toHaveBeenCalledWith('candidate-1');
  });

  it('SHP-03 展示总数/前三套/成本假设，所有真实衣物按真实 id 导航', async () => {
    render(<ShoppingReportScreen candidateId="candidate-1" service={makeService()} />);

    expect(await screen.findByText('4')).toBeOnTheScreen();
    expect(screen.getByText('第 3 套上装')).toBeOnTheScreen();
    expect(screen.queryByText('第 4 套上装')).toBeNull();
    expect(screen.getByText('¥33.30 / 次')).toBeOnTheScreen();
    expect(screen.getByText(/按预计穿 30 次的假设/)).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: '打开衣物 第 1 套上装' }));
    expect(routerMock.push).toHaveBeenCalledWith('/garment/look-1-top-id');
    fireEvent.press(screen.getByRole('button', { name: '返回候选列表' }));
    expect(routerMock.push).toHaveBeenCalledWith('/shopping');
  });

  it('SHP-03 pending 时不把 0 套展示为最终结论，并可恢复分析', async () => {
    const pending = report({
      candidate: candidate({ analysisState: 'pending' }),
      looks: [],
      compatibleLookCount: 0,
    });
    const retryAnalysis = jest.fn(async () => report());
    render(
      <ShoppingReportScreen
        candidateId="candidate-1"
        service={makeService({ getCandidateReport: async () => pending, retryAnalysis })}
      />,
    );

    expect(await screen.findByText('组合分析尚未完成')).toBeOnTheScreen();
    expect(screen.queryByText('套合法组合')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: '恢复分析' }));
    expect(await screen.findByText('套合法组合')).toBeOnTheScreen();
    expect(retryAnalysis).toHaveBeenCalledWith('candidate-1');
  });

  it('SHP-03 再次校验已保存链接，系统打开失败时显示可恢复错误', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockRejectedValueOnce(new Error('no handler'));
    render(<ShoppingReportScreen candidateId="candidate-1" service={makeService()} />);
    await screen.findByText('深蓝短夹克');

    fireEvent.press(screen.getByRole('link', { name: '在系统中打开商品链接' }));
    expect(await screen.findByText('系统无法打开这个商品链接，请稍后重试。')).toBeOnTheScreen();
    expect(open).toHaveBeenCalledWith('https://shop.example/item/1');
    open.mockRestore();
  });

  it('SHP-03 保存三态判断；删除前明确二次确认且只调用候选删除', async () => {
    const updateCandidate = jest.fn(async (_id: string, patch: { verdict?: string }) =>
      report({ candidate: candidate({ verdict: patch.verdict === 'fills_gap' ? 'fills_gap' : 'undecided' }) }),
    ) as unknown as ShoppingService['updateCandidate'];
    const deleteCandidate = jest.fn(async (_id: string) => undefined);
    const service = makeService({ updateCandidate, deleteCandidate });
    render(<ShoppingReportScreen candidateId="candidate-1" service={service} />);
    await screen.findByText('深蓝短夹克');

    fireEvent.press(screen.getByRole('button', { name: '补足缺口' }));
    fireEvent.press(screen.getByRole('button', { name: '保存候选判断' }));
    await waitFor(() => expect(updateCandidate).toHaveBeenCalledWith('candidate-1', { verdict: 'fills_gap' }));

    fireEvent.press(screen.getByRole('button', { name: '删除候选' }));
    expect(screen.getByText('这只会删除这条购物候选，不会删除任何衣橱衣物、衣物照片或已有造型。')).toBeOnTheScreen();
    expect(deleteCandidate).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: '确认只删除候选' }));
    await waitFor(() => expect(deleteCandidate).toHaveBeenCalledWith('candidate-1'));
    expect(routerMock.replace).toHaveBeenCalledWith('/shopping');
  });
});

describe('商品链接即时校验', () => {
  it.each(['javascript:alert(1)', 'file:///etc/passwd', 'https://user:secret@example.com/item', 'https://example.com/\u0000item'])(
    '拒绝不可信链接 %s',
    (url) => expect(validateProductUrl(url).ok).toBe(false),
  );

  it('接受普通 https 链接并允许留空', () => {
    expect(validateProductUrl('https://example.com/item?id=1').ok).toBe(true);
    expect(validateProductUrl('')).toEqual({ ok: true, value: null });
  });
});
