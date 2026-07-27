import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { hitTarget, palette, radius, spacing, typography } from '@/design-system';

interface EmptyStateCardProps {
  /** 哑金序号或装饰字，如 "01" */
  eyebrow?: string;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  /** 主操作暂未接线时显示的说明，保持诚实，不做假按钮 */
  actionHint?: string;
  icon?: ReactNode;
}

/**
 * 空状态卡片：沙色表面、发丝线描边、一个主操作。
 * 遵循 HIGH_FIDELITY_UI_SPEC：每页只有一个主操作，不堆叠多层卡片。
 */
export function EmptyStateCard({
  eyebrow,
  title,
  description,
  actionLabel,
  onAction,
  actionHint,
  icon,
}: EmptyStateCardProps) {
  return (
    <View style={styles.card}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      {icon}
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {actionLabel ? (
        <Pressable
          accessibilityRole="button"
          accessibilityHint={actionHint}
          onPress={onAction}
          style={({ pressed }) => [
            styles.button,
            pressed ? styles.buttonPressed : null,
          ]}
        >
          <Text style={styles.buttonLabel}>{actionLabel}</Text>
        </Pressable>
      ) : null}
      {actionHint ? <Text style={styles.hint}>{actionHint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.lg,
    backgroundColor: palette.sandSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    borderRadius: radius.lg,
  },
  eyebrow: {
    ...typography.caption,
    fontFamily: 'serif',
    color: palette.mutedGold,
    letterSpacing: 2,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.headline,
    color: palette.charcoal,
    marginBottom: spacing.xs,
  },
  description: {
    ...typography.body,
    color: palette.charcoalSoft,
  },
  button: {
    marginTop: spacing.lg,
    minHeight: hitTarget.preferred,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: palette.oxblood,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
  },
  buttonPressed: {
    backgroundColor: palette.oxbloodDeep,
  },
  buttonLabel: {
    ...typography.body,
    color: palette.white,
  },
  hint: {
    ...typography.caption,
    color: palette.charcoalSoft,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});
