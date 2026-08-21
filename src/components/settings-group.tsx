import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Brand, BrandFonts, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';

/**
 * Grupowana lista ustawień (ikona + etykieta + chevron/switch) — wspólna dla
 * ekranu ustawień i panelu admina, żeby oba miały ten sam język wizualny.
 */
export function SettingsGroupLabel({ children }: { children: string }) {
  return <Text style={styles.groupLabel}>{children}</Text>;
}

export function SettingsGroup({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.group, style]}>{children}</View>;
}

export function SettingsDivider() {
  return <View style={styles.divider} />;
}

export function SettingsChevron() {
  return <Text style={styles.chevron}>›</Text>;
}

type IconRowProps = {
  icon: ReactNode;
  iconBg: string;
  label: string;
  hint?: string;
  onPress?: () => void;
  disabled?: boolean;
  trailing?: ReactNode;
  labelColor?: string;
};

export function SettingsIconRow({
  icon,
  iconBg,
  label,
  hint,
  onPress,
  disabled,
  trailing,
  labelColor,
}: IconRowProps) {
  const content = (
    <View style={styles.row}>
      <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>{icon}</View>
      <View style={styles.labelCol}>
        <Text style={[styles.rowLabel, labelColor ? { color: labelColor } : null]} numberOfLines={1}>
          {label}
        </Text>
        {hint ? (
          <Text style={styles.rowHint} numberOfLines={2}>
            {hint}
          </Text>
        ) : null}
      </View>
      {trailing}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [pressed && !disabled && styles.rowPressed]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  groupLabel: {
    fontFamily: BrandFonts.bodySemibold,
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: Brand.textMuted,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
  },
  group: {
    backgroundColor: Brand.surface,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    ...shadow('sm'),
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: Brand.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowPressed: {
    opacity: 0.7,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  labelCol: {
    flex: 1,
    gap: 2,
    paddingRight: 8,
  },
  rowLabel: {
    fontFamily: BrandFonts.bodySemibold,
    fontSize: 14.5,
    color: Brand.textPrimary,
  },
  rowHint: {
    fontFamily: BrandFonts.body,
    fontSize: 12.5,
    color: Brand.textMuted,
  },
  chevron: {
    fontFamily: BrandFonts.body,
    fontSize: 20,
    fontWeight: '300',
    color: Brand.textMuted,
  },
});
