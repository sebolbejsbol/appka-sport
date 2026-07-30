import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Brand, Radius } from '@/constants/theme';
import { shadow, Typography } from '@/constants/ui';
import { t } from '@/i18n';

export type ScreenHeaderAction = {
  key: string;
  icon: string;
  onPress: () => void;
  accessibilityLabel: string;
  /** Wyróżniony przycisk akcji (np. „＋ Utwórz"). */
  primary?: boolean;
};

type ScreenHeaderProps = {
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  rightActions?: ScreenHeaderAction[];
  insetTop: number;
  elevated?: boolean;
  /**
   * Duży tytuł (styl nowoczesnych aplikacji). Domyślnie włączony dla ekranów
   * głównych (bez przycisku wstecz), wyłączony dla podstron.
   */
  large?: boolean;
};

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  rightActions,
  insetTop,
  elevated = true,
  large,
}: ScreenHeaderProps) {
  const isLarge = large ?? !onBack;

  if (isLarge) {
    return (
      <View style={[styles.largeBar, { paddingTop: insetTop + 10 }]}>
        <View style={styles.largeTextBlock}>
          {title ? (
            <Text style={styles.largeTitle} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
          {subtitle ? (
            <Text style={styles.largeSubtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {rightActions && rightActions.length > 0 ? (
          <View style={styles.largeActions}>
            {rightActions.map((action) => (
              <ActionButton key={action.key} action={action} />
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.bar,
        elevated && styles.barElevated,
        { paddingTop: insetTop + 8 },
      ]}>
      <View style={styles.side}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            style={({ pressed }) => [styles.iconCircle, pressed && styles.pressed]}>
            <Text style={styles.backIcon}>←</Text>
          </Pressable>
        ) : null}
      </View>

      {title ? (
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      ) : (
        <View style={styles.titleSpacer} />
      )}

      <View style={[styles.side, styles.sideRight]}>
        {rightActions?.map((action) => (
          <Pressable
            key={action.key}
            onPress={action.onPress}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={action.accessibilityLabel}
            style={({ pressed }) => [styles.iconCircle, pressed && styles.pressed]}>
            <Text style={styles.icon}>{action.icon}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function ActionButton({ action }: { action: ScreenHeaderAction }) {
  return (
    <Pressable
      onPress={action.onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={action.accessibilityLabel}
      style={({ pressed }) => [
        styles.iconCircle,
        action.primary && styles.iconCirclePrimary,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.icon, action.primary && styles.iconPrimary]}>{action.icon}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  largeBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    // Miejsce z lewej na pływający przycisk menu (hamburger) na ekranach głównych.
    paddingLeft: 64,
    paddingRight: 20,
    paddingBottom: 14,
    backgroundColor: Brand.surface,
  },
  largeTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  largeTitle: {
    ...Typography.screenTitle,
  },
  largeSubtitle: {
    ...Typography.caption,
    marginTop: 3,
  },
  largeActions: {
    flexDirection: 'row',
    gap: 8,
    paddingLeft: 12,
  },
  iconCirclePrimary: {
    backgroundColor: Brand.primary,
    borderColor: Brand.primary,
    ...shadow('sm'),
  },
  iconPrimary: {
    color: Brand.primaryText,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
    minHeight: 48,
    backgroundColor: Brand.screenBackground,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Brand.divider,
  },
  barElevated: {
    backgroundColor: Brand.surface,
    borderBottomColor: Brand.border,
    ...shadow('sm'),
  },
  side: {
    width: 88,
    justifyContent: 'center',
  },
  sideRight: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 4,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    ...Typography.sectionTitle,
    fontSize: 17,
  },
  titleSpacer: {
    flex: 1,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  backIcon: {
    fontSize: 22,
    color: Brand.textPrimary,
    fontWeight: '500',
    lineHeight: 24,
    marginTop: -1,
  },
  icon: {
    fontSize: 20,
    color: Brand.textPrimary,
  },
  pressed: {
    opacity: 0.8,
  },
});
