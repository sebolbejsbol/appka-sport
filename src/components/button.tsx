import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Brand, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'sm';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  style,
}: Props) {
  const isPrimary = variant === 'primary';
  const isSecondary = variant === 'secondary';
  const isGhost = variant === 'ghost';
  const isDanger = variant === 'danger';
  const isSmall = size === 'sm';

  const pressed = useSharedValue(0);
  // Tylko web: dotyk nigdy nie odpala onHoverIn/Out, więc na natywnych
  // platformach ta wartość zostaje 0 przez cały czas — czysty no-op.
  const hovered = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: withSpring(1 - pressed.value * 0.04 + hovered.value * 0.012, {
          damping: 18,
          stiffness: 260,
        }),
      },
    ],
    opacity: withTiming(1 - pressed.value * 0.12, { duration: 90 }),
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => {
        pressed.value = 1;
      }}
      onPressOut={() => {
        pressed.value = 0;
      }}
      onHoverIn={() => {
        hovered.value = 1;
      }}
      onHoverOut={() => {
        hovered.value = 0;
      }}
      disabled={disabled}
      accessibilityRole="button"
      style={[
        styles.base,
        isSmall ? styles.baseSm : styles.baseMd,
        isPrimary && styles.primary,
        isSecondary && styles.secondary,
        isGhost && styles.ghost,
        isDanger && styles.danger,
        disabled && styles.disabled,
        animatedStyle,
        style,
      ]}>
      <Text
        style={[
          styles.label,
          isSmall ? styles.labelSm : styles.labelMd,
          isPrimary && styles.primaryLabel,
          isSecondary && styles.secondaryLabel,
          isGhost && styles.ghostLabel,
          isDanger && styles.dangerLabel,
        ]}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  baseMd: {
    paddingVertical: 15,
    paddingHorizontal: 20,
    minHeight: 52,
  },
  baseSm: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    minHeight: 40,
  },
  primary: {
    backgroundColor: Brand.primary,
    ...shadow('sm'),
  },
  secondary: {
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.borderStrong,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  danger: {
    backgroundColor: Brand.dangerLight,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  disabled: {
    opacity: 0.45,
  },
  label: {
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  labelMd: {
    fontSize: 16,
  },
  labelSm: {
    fontSize: 14,
  },
  primaryLabel: {
    color: Brand.primaryText,
  },
  secondaryLabel: {
    color: Brand.textPrimary,
  },
  ghostLabel: {
    color: Brand.primary,
  },
  dangerLabel: {
    color: Brand.danger,
  },
});
