import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import LooksScreen from '../looks/LooksScreen';
import PlanScreen from '../plan/PlanScreen';
import WardrobeScreen from './WardrobeScreen';

describe('其余三个主标签页骨架', () => {
  it('衣橱页显示标题与空状态主操作', () => {
    render(<WardrobeScreen />);
    expect(screen.getByText('衣橱')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '添加衣物' })).toBeOnTheScreen();
  });

  it('造型页显示标题与空状态主操作', () => {
    render(<LooksScreen />);
    expect(screen.getByText('造型')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '新建造型' })).toBeOnTheScreen();
  });

  it('计划页显示标题与空状态主操作', () => {
    render(<PlanScreen />);
    expect(screen.getByText('计划')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '添加计划' })).toBeOnTheScreen();
  });
});
