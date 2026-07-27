import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import TodayScreen from './TodayScreen';

describe('TodayScreen（今日页骨架）', () => {
  it('显示页面标题 今天', () => {
    render(<TodayScreen />);
    expect(screen.getByText('今天')).toBeOnTheScreen();
  });

  it('衣橱未就绪时如实展示空状态与 12 件启动包说明', () => {
    render(<TodayScreen />);
    expect(screen.getByText('尚无今日搭配')).toBeOnTheScreen();
    expect(screen.getByText('先整理 12 件常穿衣物')).toBeOnTheScreen();
  });

  it('主操作是可访问的按钮且只有一个', () => {
    render(<TodayScreen />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(screen.getByRole('button', { name: '开始整理衣橱' })).toBeOnTheScreen();
  });
});
