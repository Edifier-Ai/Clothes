import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

import { PRIMARY_NAV } from '@/design-system';

type IconName = ComponentProps<typeof Ionicons>['name'];

export interface TabDefinition {
  /** Expo Router 路由段（不含分组括号） */
  segment: string;
  /** 底栏显示文案 */
  label: (typeof PRIMARY_NAV)[number];
  /** 细线风格图标（Ionicons outline） */
  icon: IconName;
  iconFocused: IconName;
}

/**
 * 底部主导航定义。文案与顺序由 tokens 的 PRIMARY_NAV 固定，
 * 路由段与图标在此登记，供 (tabs)/_layout.tsx 与测试共用。
 */
export const TABS: readonly TabDefinition[] = [
  {
    segment: 'index',
    label: '今天',
    icon: 'today-outline',
    iconFocused: 'today',
  },
  {
    segment: 'wardrobe',
    label: '衣橱',
    icon: 'shirt-outline',
    iconFocused: 'shirt',
  },
  {
    segment: 'looks',
    label: '造型',
    icon: 'albums-outline',
    iconFocused: 'albums',
  },
  {
    segment: 'plan',
    label: '计划',
    icon: 'calendar-outline',
    iconFocused: 'calendar',
  },
] as const;
