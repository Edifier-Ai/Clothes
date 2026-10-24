import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { PropsWithChildren, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { hitTarget, palette, radius, spacing, typography } from '@/design-system';

export function SettingsPage({
  title,
  children,
  footer,
}: PropsWithChildren<{ title: string; footer?: ReactNode }>) {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.page} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回"
          hitSlop={8}
          onPress={() => router.back()}
          style={styles.back}
        >
          <Ionicons name="arrow-back" size={24} color={palette.charcoal} />
        </Pressable>
        <Text style={styles.pageTitle}>{title}</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function SectionLabel({ children }: PropsWithChildren) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export function HairlineGroup({ children }: PropsWithChildren) {
  return <View style={styles.group}>{children}</View>;
}

export function SettingsRow({
  icon,
  title,
  description,
  value,
  onPress,
  danger = false,
  accessibilityLabel,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  accessibilityLabel?: string;
}) {
  const body = (
    <>
      <Ionicons
        name={icon}
        size={23}
        color={danger ? palette.danger : palette.charcoal}
        style={styles.rowIcon}
      />
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, danger && styles.dangerText]}>{title}</Text>
        {description ? <Text style={styles.rowDescription}>{description}</Text> : null}
      </View>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {onPress ? <Ionicons name="chevron-forward" size={19} color={palette.charcoalSoft} /> : null}
    </>
  );
  if (!onPress) return <View style={styles.row}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      {body}
    </Pressable>
  );
}

export function EditorialButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  tone = 'primary',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  tone?: 'primary' | 'secondary' | 'danger';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        tone === 'primary' && styles.buttonPrimary,
        tone === 'secondary' && styles.buttonSecondary,
        tone === 'danger' && styles.buttonDanger,
        (disabled || loading) && styles.buttonDisabled,
        pressed && !disabled && !loading && styles.buttonPressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={tone === 'secondary' ? palette.charcoal : palette.white} />
      ) : (
        <Text style={[styles.buttonLabel, tone === 'secondary' && styles.buttonSecondaryLabel]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function MessagePanel({
  eyebrow,
  title,
  description,
  tone = 'neutral',
  actionLabel,
  onAction,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  tone?: 'neutral' | 'gold' | 'error' | 'success';
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View
      style={[
        styles.message,
        tone === 'gold' && styles.messageGold,
        tone === 'error' && styles.messageError,
        tone === 'success' && styles.messageSuccess,
      ]}
    >
      {eyebrow ? <Text style={styles.messageEyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.messageTitle}>{title}</Text>
      <Text style={styles.messageDescription}>{description}</Text>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          style={styles.inlineAction}
        >
          <Text style={styles.inlineActionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.choice, selected && styles.choiceSelected]}
    >
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.paperWhite },
  header: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.hairline,
  },
  back: {
    width: hitTarget.preferred,
    height: hitTarget.preferred,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageTitle: { ...typography.title, flex: 1, textAlign: 'center', color: palette.charcoal },
  headerSpacer: { width: hitTarget.preferred },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.hairline,
    backgroundColor: palette.paperWhite,
  },
  sectionLabel: {
    ...typography.bodySm,
    color: palette.charcoalSoft,
    marginTop: spacing.xs,
    letterSpacing: 0.5,
  },
  group: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
  },
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.hairline,
  },
  rowPressed: { backgroundColor: palette.sandSoft },
  rowIcon: { width: 38 },
  rowText: { flex: 1, paddingRight: spacing.sm },
  rowTitle: { ...typography.body, color: palette.charcoal },
  rowDescription: { ...typography.caption, color: palette.charcoalSoft, marginTop: 2 },
  rowValue: { ...typography.bodySm, color: palette.mutedGold, marginRight: spacing.xs },
  dangerText: { color: palette.danger },
  button: {
    minHeight: hitTarget.preferred,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
  },
  buttonPrimary: { backgroundColor: palette.charcoal },
  buttonSecondary: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.charcoalSoft,
    backgroundColor: palette.paperWhite,
  },
  buttonDanger: { backgroundColor: palette.danger },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { opacity: 0.82 },
  buttonLabel: { ...typography.body, color: palette.white, fontWeight: '600' },
  buttonSecondaryLabel: { color: palette.charcoal },
  message: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: palette.charcoalSoft,
    backgroundColor: palette.sandSoft,
  },
  messageGold: { borderLeftColor: palette.mutedGold },
  messageError: { borderLeftColor: palette.danger },
  messageSuccess: { borderLeftColor: palette.success },
  messageEyebrow: { ...typography.caption, color: palette.mutedGold, letterSpacing: 1 },
  messageTitle: { ...typography.headline, color: palette.charcoal, marginTop: spacing.xxs },
  messageDescription: { ...typography.bodySm, color: palette.charcoalSoft, marginTop: spacing.xxs },
  inlineAction: { minHeight: hitTarget.min, justifyContent: 'center', alignSelf: 'flex-start' },
  inlineActionText: { ...typography.bodySm, color: palette.oxblood, fontWeight: '600' },
  choice: {
    minHeight: hitTarget.min,
    paddingHorizontal: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    borderRadius: radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  choiceSelected: { backgroundColor: palette.oxblood, borderColor: palette.oxblood },
  choiceText: { ...typography.bodySm, color: palette.charcoal },
  choiceTextSelected: { color: palette.white },
});
