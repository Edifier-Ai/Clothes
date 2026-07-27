import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';

import { hitTarget, palette, typography } from '@/design-system';
import { TABS } from '@/features/shell/tabs-config';

/**
 * 底部主导航：今天 / 衣橱 / 造型 / 计划。
 * 纸白底、发丝线顶边、酒红选中色；细线 Ionicons 图标。
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.oxblood,
        tabBarInactiveTintColor: palette.charcoalSoft,
        tabBarLabelStyle: styles.label,
        tabBarStyle: styles.bar,
        tabBarItemStyle: styles.item,
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.segment}
          name={tab.segment}
          options={{
            title: tab.label,
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? tab.iconFocused : tab.icon}
                size={size}
                color={color}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: palette.paperWhite,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.hairline,
  },
  item: {
    minHeight: hitTarget.min,
    paddingTop: 6,
  },
  label: {
    ...typography.caption,
    fontSize: 12,
  },
});
