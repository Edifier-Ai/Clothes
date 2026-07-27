import type { PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette, spacing, typography } from '@/design-system';

interface TabShellProps {
  /** 页面标题（衬线，方向 3 编辑感） */
  title: string;
  /** 标题下方的次级说明，可选 */
  subtitle?: string;
  /** 标题行右侧附加内容，如统计数字 */
  trailing?: React.ReactNode;
}

/**
 * 四个主标签页的公共外壳：纸白背景、安全区、衬线页标题。
 * 业务内容通过 children 注入，保持页面状态（空/加载/失败）由各页自治。
 */
export function TabShell({
  title,
  subtitle,
  trailing,
  children,
}: PropsWithChildren<TabShellProps>) {
  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {trailing}
      </View>
      <View style={styles.content}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.paperWhite,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerText: {
    flex: 1,
  },
  title: {
    ...typography.title,
    color: palette.charcoal,
  },
  subtitle: {
    ...typography.bodySm,
    color: palette.charcoalSoft,
    marginTop: spacing.xxs,
  },
  content: {
    flex: 1,
  },
});
