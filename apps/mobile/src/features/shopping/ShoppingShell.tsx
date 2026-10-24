import type { PropsWithChildren, ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { hitTarget, palette, spacing, typography } from '@/design-system';
import { shoppingTextGold } from './colors';

export function ShoppingShell({
  step,
  title,
  subtitle,
  children,
  footer,
}: PropsWithChildren<{
  step: '01' | '02' | '03';
  title: string;
  subtitle: string;
  footer?: ReactNode;
}>) {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回"
          hitSlop={8}
          onPress={() => router.back()}
          style={styles.back}
        >
          <Ionicons name="arrow-back-outline" size={22} color={palette.charcoal} />
        </Pressable>
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>{step} / 03 · 购物守门</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
      </View>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.primary, disabled && styles.primaryDisabled, pressed && !disabled && styles.pressed]}
    >
      <Text style={styles.primaryLabel}>{label}</Text>
    </Pressable>
  );
}

export function InlineState({
  title,
  description,
  actionLabel,
  onAction,
  danger = false,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  danger?: boolean;
}) {
  return (
    <View style={[styles.state, danger && styles.stateDanger]}>
      <Text style={[styles.stateTitle, danger && styles.dangerText]}>{title}</Text>
      <Text style={styles.stateDescription}>{description}</Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" accessibilityLabel={actionLabel} onPress={onAction} style={styles.stateAction}>
          <Text style={styles.stateActionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.paperWhite },
  header: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.hairline,
  },
  back: {
    width: hitTarget.preferred,
    height: hitTarget.preferred,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
  },
  heading: { flex: 1, paddingRight: spacing.sm },
  eyebrow: { ...typography.caption, color: shoppingTextGold, letterSpacing: 1.2, marginBottom: spacing.xxs },
  title: { ...typography.title, color: palette.charcoal },
  subtitle: { ...typography.bodySm, color: palette.charcoalSoft, marginTop: spacing.xxs },
  scroll: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    backgroundColor: palette.paperWhite,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.hairline,
  },
  primary: {
    minHeight: hitTarget.preferred,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    backgroundColor: palette.charcoal,
  },
  primaryDisabled: { opacity: 0.42 },
  primaryLabel: { ...typography.body, color: palette.white },
  pressed: { opacity: 0.78 },
  state: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderLeftWidth: 2,
    borderLeftColor: palette.mutedGold,
    backgroundColor: palette.sandSoft,
  },
  stateDanger: { borderLeftColor: palette.danger },
  stateTitle: { ...typography.headline, color: palette.charcoal },
  stateDescription: { ...typography.bodySm, color: palette.charcoalSoft, marginTop: spacing.xxs },
  stateAction: { minHeight: hitTarget.min, justifyContent: 'center', alignSelf: 'flex-start', marginTop: spacing.xs },
  stateActionText: { ...typography.bodySm, color: palette.oxblood, textDecorationLine: 'underline' },
  dangerText: { color: palette.danger },
});
