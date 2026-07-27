import { describe, expect, it } from '@jest/globals';

import { PRIMARY_NAV } from '@/design-system';
import { TABS } from './tabs-config';

describe('主导航 tabs-config', () => {
  it('恰好四个标签，顺序与文案固定为 今天/衣橱/造型/计划', () => {
    expect(TABS).toHaveLength(4);
    expect(TABS.map((tab) => tab.label)).toEqual([...PRIMARY_NAV]);
  });

  it('首页落在 index 路由段', () => {
    expect(TABS[0].segment).toBe('index');
  });

  it('每个标签都有细线图标与聚焦图标', () => {
    for (const tab of TABS) {
      expect(tab.icon.length).toBeGreaterThan(0);
      expect(tab.iconFocused.length).toBeGreaterThan(0);
      expect(tab.icon).toContain('outline');
    }
  });

  it('路由段互不重复', () => {
    const segments = TABS.map((tab) => tab.segment);
    expect(new Set(segments).size).toBe(segments.length);
  });
});
