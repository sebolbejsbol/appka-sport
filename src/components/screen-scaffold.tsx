import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Brand, Layout } from '@/constants/theme';
import { Typography } from '@/constants/ui';

type Props = {
  title?: string;
  subtitle?: string;
  insetTop: number;
  insetBottom?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
};

export function ScreenScaffold({
  title,
  subtitle,
  insetTop,
  insetBottom = 0,
  children,
  style,
  contentStyle,
}: Props) {
  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: insetTop + Layout.menuClearance,
          paddingBottom: insetBottom + Layout.screenPaddingBottom,
        },
        style,
      ]}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Brand.screenBackground,
    paddingHorizontal: Layout.screenPaddingX,
  },
  title: {
    ...Typography.screenTitle,
    marginBottom: 4,
  },
  subtitle: {
    ...Typography.caption,
    marginBottom: 14,
  },
  content: {
    flex: 1,
  },
});
