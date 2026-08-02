import { describe, expect, it, jest } from '@jest/globals';
import { GarmentPicker } from './GarmentPicker';
import type { PickCandidate } from './pickFilter';
import { fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-image', () => ({ Image: () => null }));


const POOL: PickCandidate[] = [
  { id: 'a', name: '白衬衫', category: 'top', status: 'clean', archivedAt: null, brand: 'ARKET', note: null, imageRelPath: null },
  { id: 'b', name: '黑色半裙', category: 'bottom', status: 'clean', archivedAt: null, brand: null, note: null, imageRelPath: null },
  { id: 'c', name: '乐福鞋', category: 'shoes', status: 'laundry', archivedAt: null, brand: null, note: null, imageRelPath: null },
];

function setup(overrides: Partial<Parameters<typeof GarmentPicker>[0]> = {}) {
  const onPick = jest.fn();
  render(
    <GarmentPicker
      candidates={POOL}
      slot={null}
      selectedIds={new Set(['b'])}
      onPick={onPick}
      onClose={() => undefined}
      {...overrides}
    />,
  );
  return { onPick };
}

describe('GarmentPicker（LOK-04 选衣面板）', () => {
  it('默认只看可用：待洗衣物不显示', () => {
    setup();
    expect(screen.getByText('白衬衫')).toBeOnTheScreen();
    expect(screen.getByText('黑色半裙')).toBeOnTheScreen();
    expect(screen.queryByText('乐福鞋')).toBeNull();
  });

  it('关掉「只看可用」后不可用衣物出现并标注不可用', () => {
    setup();
    fireEvent.press(screen.getByRole('button', { name: '只看可用' }));
    expect(screen.getByText('乐福鞋')).toBeOnTheScreen();
    expect(screen.getByText(/不可用/)).toBeOnTheScreen();
  });

  it('搜索过滤', () => {
    setup();
    fireEvent.changeText(screen.getByLabelText('搜索衣物'), '半裙');
    expect(screen.queryByText('白衬衫')).toBeNull();
    expect(screen.getByText('黑色半裙')).toBeOnTheScreen();
  });

  it('已选衣物显示已选标记', () => {
    setup();
    expect(screen.getByText('已选 ✓')).toBeOnTheScreen();
  });

  it('点选回调 onPick', () => {
    const { onPick } = setup();
    fireEvent.press(screen.getByText('白衬衫'));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('快速模式按槽位过滤类别（top 槽只见上装）', () => {
    setup({ slot: 'top' });
    expect(screen.getByText('选择上装')).toBeOnTheScreen();
    expect(screen.getByText('白衬衫')).toBeOnTheScreen();
    expect(screen.queryByText('黑色半裙')).toBeNull();
  });

  it('无结果时显示空态文案', () => {
    setup();
    fireEvent.changeText(screen.getByLabelText('搜索衣物'), '不存在的东西');
    expect(screen.getByText(/没有符合条件的衣物/)).toBeOnTheScreen();
  });
});
