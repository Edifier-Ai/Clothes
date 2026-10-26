import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import TodayScreen, { loadTodayItems, type TodayGarment } from './TodayScreen';
import { DEFAULT_RECOMMENDATION_FACTORS, type GarmentForRec, type Outfit } from '@/core/recommend';
import { applyPostWear } from '@/core/garments/service';
import { palette } from '@/design-system';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

// TDY-07：穿后洗护面板走 service 层；这里mock掉，避免触碰真实 DB/文件系统。
jest.mock('@/core/garments/service', () => ({
  applyPostWear: jest.fn(() => Promise.resolve({ updatedIds: [], skippedIds: [] })),
  getGarmentDetail: (id: string) => Promise.resolve({ garment: { name: `衣物-${id}` } }),
}));

const applyPostWearMock = applyPostWear as jest.MockedFunction<typeof applyPostWear>;

const NAMES: Record<string, string> = {
  t1: '白色亚麻衬衫',
  t2: '海军蓝针织衫',
  t3: '酒红真丝上衣',
  b1: '黑色直筒裤',
  b2: '沙色半裙',
  b3: '深蓝牛仔裤',
  s1: '黑色乐福鞋',
  s2: '白色运动鞋',
  o1: '驼色风衣',
  o2: '炭灰西装',
  f1: '丝巾',
  f2: '皮带',
};

function g(id: string, category: GarmentForRec['category']): TodayGarment {
  return {
    id,
    category,
    status: 'clean',
    createdAt: 1_000_000,
    updatedAt: 1_000_000,
    lastWornAt: null,
    timesWorn: 0,
    displayName: NAMES[id] ?? '常穿衣物',
    imageRelPath: `derivatives/${id}.png`,
  };
}

const twelveItems: GarmentForRec[] = [
  g('t1', 'top'),
  g('t2', 'top'),
  g('t3', 'top'),
  g('b1', 'bottom'),
  g('b2', 'bottom'),
  g('b3', 'bottom'),
  g('s1', 'shoes'),
  g('s2', 'shoes'),
  g('o1', 'outerwear'),
  g('o2', 'outerwear'),
  g('f1', 'accessory'),
  g('f2', 'accessory'),
];

const loadNoFeedback = async () => new Map<string, number>();

/** 走完整「就穿这套 → 完成记录」流程，停在穿后洗护面板出现。 */
async function submitWearAndOpenPostWearPanel() {
  render(
    <TodayScreen
      loadItems={async () => twelveItems}
      onSubmit={async () => ({ inserted: true })}
      onFeedback={async () => ({ inserted: true })}
      loadFeedbackWeights={loadNoFeedback}
      now={2_000_000}
    />,
  );
  await waitFor(() => {
    expect(screen.getByRole('button', { name: '就穿这套' })).toBeOnTheScreen();
  });
  fireEvent.press(screen.getByRole('button', { name: '就穿这套' }));
  await waitFor(() => {
    expect(screen.getByRole('button', { name: '完成记录' })).toBeOnTheScreen();
  });
  fireEvent.press(screen.getByRole('button', { name: '完成记录' }));
  await waitFor(() => {
    expect(screen.getByText('穿后洗护')).toBeOnTheScreen();
  });
}

describe('TodayScreen（今日页）', () => {
  beforeEach(() => {
    applyPostWearMock.mockClear();
    mockPush.mockClear();
  });
  it('显示页面标题 今天', () => {
    render(<TodayScreen loadItems={async () => new Promise<GarmentForRec[]>(() => [])} />);
    expect(screen.getByText('今天')).toBeOnTheScreen();
  });

  it('齿轮入口打开真实设置路由', () => {
    render(<TodayScreen loadItems={async () => new Promise<GarmentForRec[]>(() => [])} />);
    fireEvent.press(screen.getByRole('button', { name: '打开设置' }));
    expect(mockPush).toHaveBeenCalledWith('/settings');
  });

  it('加载中显示加载提示', () => {
    render(<TodayScreen loadItems={async () => new Promise<GarmentForRec[]>(() => [])} />);
    expect(screen.getByText('加载今日搭配…')).toBeOnTheScreen();
  });

  it('从 DAO 展示项装配真实名称、最佳图片、颜色与穿着统计', async () => {
    const garment = {
      id: '018f2e62-9bea-7e8b-a0a4-7a4861000001',
      name: '象牙白真丝衬衫',
      category: 'top',
      status: 'clean',
      priceMinor: null,
      currency: null,
      purchaseDate: null,
      archivedAt: null,
      deletedAt: null,
      createdAt: 10,
      updatedAt: 20,
    };
    const source = {
      listGarmentsWithImages: jest.fn(async () => [
        { garment, imageRelPath: 'cutouts/thumb-ivory.png' },
      ]),
      loadWearStats: jest.fn(async () =>
        new Map([[garment.id, { lastWornAt: 19, timesWorn: 7 }]]),
      ),
      loadTags: jest.fn(async () => [
        { garmentId: garment.id, kind: 'color', value: 'ivory' },
        { garmentId: garment.id, kind: 'season', value: '春秋' },
      ]),
    };

    const result = await loadTodayItems(source);

    expect(result).toEqual([
      expect.objectContaining({
        id: garment.id,
        displayName: '象牙白真丝衬衫',
        imageRelPath: 'cutouts/thumb-ivory.png',
        color: 'ivory',
        season: '春秋',
        lastWornAt: 19,
        timesWorn: 7,
      }),
    ]);
    expect(source.listGarmentsWithImages).toHaveBeenCalledTimes(1);
  });

  it('衣橱读取失败展示独立错误态和重试，不冒充空衣橱', async () => {
    const loadItems = jest
      .fn<() => Promise<GarmentForRec[]>>()
      .mockRejectedValueOnce(new Error('sqlite unavailable'))
      .mockResolvedValueOnce([]);
    render(<TodayScreen loadItems={loadItems} />);

    await waitFor(() => {
      expect(screen.getByText('今日搭配加载失败')).toBeOnTheScreen();
    });
    expect(screen.queryByText('尚无今日搭配')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: '重新加载今日搭配' }));
    await waitFor(() => {
      expect(screen.getByText('尚无今日搭配')).toBeOnTheScreen();
    });
    expect(loadItems).toHaveBeenCalledTimes(2);
  });

  it('衣橱空时展示空状态与 12 件启动包说明', async () => {
    render(<TodayScreen loadItems={async () => []} />);
    await waitFor(() => {
      expect(screen.getByText('尚无今日搭配')).toBeOnTheScreen();
    });
    expect(screen.getByText('先整理 12 件常穿衣物')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '开始整理衣橱' })).toBeOnTheScreen();
    expect(screen.getByText(/明确同意使用腾讯云抠图/)).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: '开始整理衣橱' }));
    expect(mockPush).toHaveBeenCalledWith('/batch-import');
  });

  it('12 件合法衣橱展示推荐搭配与理由', async () => {
    render(
      <TodayScreen
        loadItems={async () => twelveItems}
        loadFeedbackWeights={loadNoFeedback}
        now={2_000_000}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('今日推荐')).toBeOnTheScreen();
    });
    expect(screen.getByText('推荐理由')).toBeOnTheScreen();
    const primary = screen.getByRole('button', { name: '就穿这套' });
    expect(primary).toBeOnTheScreen();
    expect(primary).toHaveStyle({ backgroundColor: palette.charcoal, minHeight: 48 });
    expect(primary).toHaveProp('accessibilityHint', '打开记录已穿表单');
    expect(screen.getByLabelText('白色亚麻衬衫图片')).toBeOnTheScreen();
  });

  it('今天气温：默认按月份估计，改成「热」后重新推荐且不再带外套', async () => {
    render(
      <TodayScreen
        loadItems={async () => twelveItems}
        loadFeedbackWeights={loadNoFeedback}
        now={new Date(2026, 0, 15).getTime()}
      />,
    );
    await waitFor(() => expect(screen.getByText('今日推荐')).toBeOnTheScreen());
    expect(screen.getByRole('button', { name: '冷 <10°', selected: true })).toBeOnTheScreen();
    expect(screen.getByText('外套')).toBeOnTheScreen();
    expect(screen.getByText(/今天偏凉，加了外套/)).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: '热 >26°' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '热 >26°', selected: true })).toBeOnTheScreen());
    await waitFor(() => expect(screen.queryByText('外套')).toBeNull());
  });

  it('「天气」要素关闭时不显示气温选择', async () => {
    render(
      <TodayScreen
        loadItems={async () => twelveItems}
        loadFeedbackWeights={loadNoFeedback}
        loadRecommendationFactors={async () => ({ ...DEFAULT_RECOMMENDATION_FACTORS, weather: false })}
        now={2_000_000}
      />,
    );
    await waitFor(() => expect(screen.getByText('今日推荐')).toBeOnTheScreen());
    expect(screen.queryByRole('button', { name: '热 >26°' })).toBeNull();
  });

  it('缺鞋时展示缺槽位提示', async () => {
    const noShoes = twelveItems.filter((i) => i.category !== 'shoes');
    render(<TodayScreen loadItems={async () => noShoes} now={2_000_000} />);
    await waitFor(() => {
      expect(screen.getByText('衣橱还差几件')).toBeOnTheScreen();
    });
    expect(screen.getByText(/缺槽位：鞋/)).toBeOnTheScreen();
  });

  it('点击就穿这套后进入记录已穿表单', async () => {
    render(<TodayScreen loadItems={async () => twelveItems} now={2_000_000} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '就穿这套' })).toBeOnTheScreen();
    });
    const wearBtn = screen.getByRole('button', { name: '就穿这套' });
    fireEvent.press(wearBtn);
    await waitFor(() => {
      expect(screen.getByText('记录已穿')).toBeOnTheScreen();
    });
    expect(screen.getByText('舒适度')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '完成记录' })).toBeOnTheScreen();
  });

  it('onSubmit 注入时点击完成记录触发回调', async () => {
    const onSubmit = jest.fn<(input: { recommendationId: string; date: string; outfit: Outfit; occasion: string; comfort: 'good' | 'ok' | 'bad'; now: number }) => Promise<{ inserted: boolean }>>();
    onSubmit.mockResolvedValue({ inserted: true });
    render(
      <TodayScreen
        loadItems={async () => twelveItems}
        onSubmit={onSubmit}
        onFeedback={async () => ({ inserted: true })}
        loadFeedbackWeights={loadNoFeedback}
        now={2_000_000}
      />,
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '就穿这套' })).toBeOnTheScreen();
    });
    fireEvent.press(screen.getByRole('button', { name: '就穿这套' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '完成记录' })).toBeOnTheScreen();
    });
    fireEvent.press(screen.getByRole('button', { name: '完成记录' }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    const call = onSubmit.mock.calls[0][0];
    expect(call.date).toBeDefined();
    expect(call.outfit.top.id).toBe('t1');
    expect(call.outfit.shoes.id).toBe('s1');
  });

  it('只换上装后下装、鞋和外套保持不变，并保存替换反馈', async () => {
    const onFeedback = jest.fn(async () => ({ inserted: true }));
    render(
      <TodayScreen
        loadItems={async () => twelveItems}
        onFeedback={onFeedback}
        loadFeedbackWeights={loadNoFeedback}
        now={2_000_000}
      />,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: '只换上装' })).toBeOnTheScreen());
    fireEvent.press(screen.getByRole('button', { name: '只换上装' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '换成 海军蓝针织衫' })).toBeOnTheScreen(),
    );
    fireEvent.press(screen.getByRole('button', { name: '换成 海军蓝针织衫' }));
    await waitFor(() => expect(screen.getByText('海军蓝针织衫')).toBeOnTheScreen());
    expect(screen.getByText('黑色直筒裤')).toBeOnTheScreen();
    expect(screen.getByText('黑色乐福鞋')).toBeOnTheScreen();
    expect(screen.getByText('驼色风衣')).toBeOnTheScreen();
    await waitFor(() =>
      expect(onFeedback).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'replace',
          slot: 'top',
          beforeItemId: 't1',
          afterItemId: 't2',
        }),
      ),
    );
  });

  it('替换覆盖层在当前视野可见并可通过标题栏关闭', async () => {
    render(
      <TodayScreen
        loadItems={async () => twelveItems}
        loadFeedbackWeights={loadNoFeedback}
        now={2_000_000}
      />,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: '只换上装' })).toBeOnTheScreen());
    fireEvent.press(screen.getByRole('button', { name: '只换上装' }));
    expect(screen.getByRole('button', { name: '关闭只换上装' })).toBeOnTheScreen();
    expect(screen.getByText('其余单品已固定，仅显示同槽且当前可用的候选。')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: '关闭只换上装' }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '关闭只换上装' })).toBeNull();
    });
    expect(screen.getByRole('button', { name: '就穿这套' })).toBeOnTheScreen();
  });

  it('主界面与换一套预览只展示衣物名称，不展示内部 UUID', async () => {
    const internalId = '018f2e62-9bea-7e8b-a0a4-7a4861abcdef';
    const namedItems = twelveItems.map((item, index) =>
      index === 0 ? { ...item, id: internalId, displayName: '象牙白真丝衬衫' } : item,
    );
    render(
      <TodayScreen
        loadItems={async () => namedItems}
        loadFeedbackWeights={loadNoFeedback}
        now={2_000_000}
      />,
    );
    await waitFor(() => expect(screen.getByText('象牙白真丝衬衫')).toBeOnTheScreen());
    expect(screen.queryByText(internalId)).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: '换一套' }));
    expect(screen.getByText('新搭配预览')).toBeOnTheScreen();
    expect(screen.queryByText(internalId)).toBeNull();
    expect(screen.getAllByLabelText(/图片$/).length).toBeGreaterThan(0);
  });

  it('换一套显示跳过原因与新搭配，采用后不重复原组合', async () => {
    const onFeedback = jest.fn(async () => ({ inserted: true }));
    render(
      <TodayScreen
        loadItems={async () => twelveItems}
        onFeedback={onFeedback}
        loadFeedbackWeights={loadNoFeedback}
        now={2_000_000}
      />,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: '换一套' })).toBeOnTheScreen());
    fireEvent.press(screen.getByRole('button', { name: '换一套' }));
    fireEvent.press(screen.getByRole('button', { name: '不喜欢配色' }));
    expect(screen.getByText('新搭配预览')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: '使用新搭配' }));
    await waitFor(() =>
      expect(onFeedback).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'skip', skipReason: '不喜欢配色' }),
      ),
    );
    expect(screen.getByRole('button', { name: '换一套' })).toBeOnTheScreen();
  });

  it('可应用新鲜模式；硬约束说明保持可见', async () => {
    render(
      <TodayScreen
        loadItems={async () => twelveItems}
        onFeedback={async () => ({ inserted: true })}
        loadFeedbackWeights={loadNoFeedback}
        now={2_000_000}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '推荐模式 · 稳妥' })).toBeOnTheScreen(),
    );
    fireEvent.press(screen.getByRole('button', { name: '推荐模式 · 稳妥' }));
    expect(screen.getByText('硬约束始终优先，模式只改变可用衣物的排序。')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: '新鲜' }));
    fireEvent.press(screen.getByRole('button', { name: '应用模式' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '推荐模式 · 新鲜' })).toBeOnTheScreen(),
    );
  });

  it('记录穿着成功后出现穿后洗护面板并列出穿过的衣物', async () => {
    await submitWearAndOpenPostWearPanel();
    expect(screen.getByText(/上装 · 衣物-t1/)).toBeOnTheScreen();
    expect(screen.getByText(/下装 · 衣物-b1/)).toBeOnTheScreen();
    expect(screen.getByText(/鞋 · 衣物-s1/)).toBeOnTheScreen();
    expect(screen.getByText(/外套 · 衣物-o1/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '完成' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '全部跳过' })).toBeOnTheScreen();
  });

  it('选「待洗」后点完成提交 applyPostWear（未选衣物为 skip）并关闭面板', async () => {
    await submitWearAndOpenPostWearPanel();
    fireEvent.press(screen.getByRole('button', { name: '衣物-t1待洗' }));
    fireEvent.press(screen.getByRole('button', { name: '完成' }));
    await waitFor(() => {
      expect(applyPostWearMock).toHaveBeenCalledTimes(1);
    });
    expect(applyPostWearMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        { garmentId: 't1', action: 'laundry' },
        { garmentId: 'b1', action: 'skip' },
        { garmentId: 's1', action: 'skip' },
        { garmentId: 'o1', action: 'skip' },
      ]),
    );
    await waitFor(() => {
      expect(screen.queryByText('穿后洗护')).toBeNull();
    });
  });

  it('「全部跳过」直接关闭面板且不调用 applyPostWear', async () => {
    await submitWearAndOpenPostWearPanel();
    fireEvent.press(screen.getByRole('button', { name: '全部跳过' }));
    expect(applyPostWearMock).not.toHaveBeenCalled();
    expect(screen.queryByText('穿后洗护')).toBeNull();
  });
});
