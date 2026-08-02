/**
 * @jest-environment node
 *
 * MVP-011 洞察四屏外壳测试：
 * 在 jest 无原生层下渲染——mock 掉 insightsService 单例（真实行为由 core 测试覆盖）+
 * expo-router/expo-image，验证外壳标题、空态/学习期态/正常态主操作存在。
 *
 * jest.mock 工厂不能引用闭包外变量（babel-jest hoisting 限制），工厂内用 require('react')
 * 取 React；imports 放顶部以符合 import/first。
 */
import { describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react-native';

import InsightsScreen from './InsightsScreen';
import IdleGarmentsScreen from './IdleGarmentsScreen';
import CostPerWearScreen from './CostPerWearScreen';
import MonthlyReportScreen from './MonthlyReportScreen';

jest.mock('@shopify/flash-list', () => ({ FlashList: () => null }));
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  return {
    useRouter: () => ({ push: () => undefined, back: () => undefined }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useFocusEffect: (cb: () => void) => React.useEffect(() => cb(), []),
    useLocalSearchParams: () => ({}),
  };
});
jest.mock('expo-image', () => ({ Image: () => null }));

// 洞察服务单例 mock：默认空态，每个用例可 spyOn 切换为学习期/正常态
jest.mock('@/core/insights/insightsService', () => ({
  getOverview: () => Promise.resolve({
    overview: {
      totalGarments: 0,
      activeGarments: 0,
      archivedGarments: 0,
      wearDays: 0,
      totalWears: 0,
      activatedGarments: 0,
      repeatRate: 0,
      avgWearsPerActivated: 0,
      isLearningPeriod: true,
    },
    learningHint: '已记录穿着天数不足 7 天，再连续记录几天，洞察会更准确。',
  }),
  getIdleReport: () => Promise.resolve({
    report: { newUnworn: [], idle30: [], idle60: [], idle90: [] },
    garmentRows: new Map(),
  }),
  getCostPerWearList: () => Promise.resolve({ rows: [], garmentRows: new Map() }),
  getMonthlyReport: () => Promise.resolve({
    monthly: {
      yearMonth: '2026-08',
      wearDays: 0,
      totalWears: 0,
      activatedGarments: 0,
      newActivatedGarments: 0,
    },
    shareable: {
      generatedAt: 0,
      window: { yearMonth: '2026-08' },
      overview: {
        totalGarments: 0, activeGarments: 0, archivedGarments: 0,
        wearDays: 0, totalWears: 0, activatedGarments: 0,
        repeatRate: 0, avgWearsPerActivated: 0,
      },
      monthly: { wearDays: 0, totalWears: 0, activatedGarments: 0, newActivatedGarments: 0 },
    },
    hasLeak: false,
  }),
  listGarmentThumbs: () => Promise.resolve(new Map()),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const insightsService = require('@/core/insights/insightsService') as {
  getOverview: () => Promise<unknown>;
  getIdleReport: () => Promise<unknown>;
  getCostPerWearList: () => Promise<unknown>;
  getMonthlyReport: () => Promise<unknown>;
};

describe('洞察四屏外壳（STA-01..04）', () => {
  it('STA-01 总览：标题 + 学习期提示 + 三个入口', async () => {
    render(<InsightsScreen />);
    expect(screen.getByText('衣橱洞察')).toBeOnTheScreen();
    expect(await screen.findByText('学习期')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '查看久未穿' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '查看成本每次' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '查看月度报告' })).toBeOnTheScreen();
  });

  it('STA-01 总览：正常态显示穿着天数/盘活单品/重复率 KPI', async () => {
    const spy = jest.spyOn(insightsService, 'getOverview').mockResolvedValue({
      overview: {
        totalGarments: 12, activeGarments: 10, archivedGarments: 2,
        wearDays: 30, totalWears: 45, activatedGarments: 8,
        repeatRate: 0.5, avgWearsPerActivated: 5.625,
        isLearningPeriod: false,
      },
      learningHint: null,
    });
    render(<InsightsScreen />);
    expect(await screen.findByText('30')).toBeOnTheScreen();
    expect(screen.getByText('45')).toBeOnTheScreen();
    expect(screen.getByText('50%')).toBeOnTheScreen();
    expect(screen.queryByText('学习期')).toBeNull();
    spy.mockRestore();
  });

  it('STA-02 久未穿：标题 + 空态提示', async () => {
    render(<IdleGarmentsScreen />);
    expect(screen.getByText('久未穿')).toBeOnTheScreen();
    expect(await screen.findByText('还没有久未穿的衣物。继续记录穿着，这里会显示需要被盘活的单品。')).toBeOnTheScreen();
  });

  it('STA-03 成本/次：标题 + 空态提示', async () => {
    render(<CostPerWearScreen />);
    expect(screen.getByText('成本/次')).toBeOnTheScreen();
    expect(await screen.findByText('还没有衣物。添加衣物并填购买价后，这里会显示成本/次。')).toBeOnTheScreen();
  });

  it('STA-04 月度报告：标题 + 月份导航 + 分享按钮', async () => {
    render(<MonthlyReportScreen />);
    expect(screen.getByText('月度报告')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '上一月' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '下一月' })).toBeOnTheScreen();
    expect(await screen.findByRole('button', { name: '分享脱敏报告' })).toBeOnTheScreen();
  });

  it('STA-04 月度报告：分享脱敏预览可展开，无泄漏告警', async () => {
    render(<MonthlyReportScreen />);
    const shareBtn = await screen.findByRole('button', { name: '分享脱敏报告' });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { fireEvent } = require('@testing-library/react-native');
    fireEvent.press(shareBtn);
    await waitFor(() => {
      expect(screen.getByText(/脱敏分享快照/)).toBeOnTheScreen();
    });
    // hasLeak=false 时不应显示泄漏告警
    expect(screen.queryByText(/脱敏校验失败/)).toBeNull();
  });
});
