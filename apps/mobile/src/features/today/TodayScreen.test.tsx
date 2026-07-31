import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import TodayScreen from './TodayScreen';
import type { GarmentForRec, Outfit } from '@/core/recommend';
import type { WeatherController } from './todayWeather';

function g(id: string, category: GarmentForRec['category']): GarmentForRec {
  return {
    id,
    category,
    status: 'clean',
    createdAt: 1_000_000,
    updatedAt: 1_000_000,
    lastWornAt: null,
    timesWorn: 0,
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

const noWeatherController: WeatherController = {
  loadInitial: async () => ({ status: 'none', weather: null }),
  useCity: async (city) => ({
    status: 'live',
    weather: {
      cityId: city.id,
      cityName: city.name,
      latitude: city.latitude,
      longitude: city.longitude,
      fetchedAt: 2_000_000,
      windowStart: 0,
      windowEnd: 86_400_000,
      minTempC: 24,
      maxTempC: 31,
      conditionCode: '101',
      provider: 'qweather',
    },
  }),
  useCurrentLocation: async () => ({
    locationStatus: 'denied',
    weather: { status: 'none', weather: null },
  }),
};

const loadNoFeedback = async () => new Map<string, number>();

describe('TodayScreen（今日页）', () => {
  it('显示页面标题 今天', () => {
    render(<TodayScreen loadItems={async () => new Promise<GarmentForRec[]>(() => [])} />);
    expect(screen.getByText('今天')).toBeOnTheScreen();
  });

  it('加载中显示加载提示', () => {
    render(<TodayScreen loadItems={async () => new Promise<GarmentForRec[]>(() => [])} />);
    expect(screen.getByText('加载今日搭配…')).toBeOnTheScreen();
  });

  it('衣橱空时展示空状态与 12 件启动包说明', async () => {
    render(<TodayScreen loadItems={async () => []} />);
    await waitFor(() => {
      expect(screen.getByText('尚无今日搭配')).toBeOnTheScreen();
    });
    expect(screen.getByText('先整理 12 件常穿衣物')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '开始整理衣橱' })).toBeOnTheScreen();
  });

  it('12 件合法衣橱展示推荐搭配与理由', async () => {
    render(
      <TodayScreen
        loadItems={async () => twelveItems}
        loadFeedbackWeights={loadNoFeedback}
        weatherController={noWeatherController}
        now={2_000_000}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('今日推荐')).toBeOnTheScreen();
    });
    expect(screen.getByText('推荐理由')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '就穿这套' })).toBeOnTheScreen();
  });

  it('缺鞋时展示缺槽位提示', async () => {
    const noShoes = twelveItems.filter((i) => i.category !== 'shoes');
    render(<TodayScreen loadItems={async () => noShoes} now={2_000_000} />);
    await waitFor(() => {
      expect(screen.getByText('衣橱还差几件')).toBeOnTheScreen();
    });
    expect(screen.getByText(/shoes/)).toBeOnTheScreen();
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
        weatherController={noWeatherController}
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
        weatherController={noWeatherController}
        now={2_000_000}
      />,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: '只换上装' })).toBeOnTheScreen());
    fireEvent.press(screen.getByRole('button', { name: '只换上装' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '换成 t2' })).toBeOnTheScreen());
    fireEvent.press(screen.getByRole('button', { name: '换成 t2' }));
    await waitFor(() => expect(screen.getByText('t2')).toBeOnTheScreen());
    expect(screen.getByText('b1')).toBeOnTheScreen();
    expect(screen.getByText('s1')).toBeOnTheScreen();
    expect(screen.getByText('o1')).toBeOnTheScreen();
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

  it('换一套显示跳过原因与新搭配，采用后不重复原组合', async () => {
    const onFeedback = jest.fn(async () => ({ inserted: true }));
    render(
      <TodayScreen
        loadItems={async () => twelveItems}
        onFeedback={onFeedback}
        loadFeedbackWeights={loadNoFeedback}
        weatherController={noWeatherController}
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
        weatherController={noWeatherController}
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

  it('定位拒绝后可手选上海，也可无天气继续', async () => {
    render(
      <TodayScreen
        loadItems={async () => twelveItems}
        loadFeedbackWeights={loadNoFeedback}
        weatherController={noWeatherController}
        now={2_000_000}
      />,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: '天气设置' })).toBeOnTheScreen());
    fireEvent.press(screen.getByRole('button', { name: '天气设置' }));
    fireEvent.press(screen.getByRole('button', { name: '使用当前位置' }));
    await waitFor(() => expect(screen.getByText(/定位未授权/)).toBeOnTheScreen());
    fireEvent.press(screen.getByRole('button', { name: '上海' }));
    await waitFor(() => expect(screen.getByText(/上海 24–31℃/)).toBeOnTheScreen());
  });
});
