// Minimal stand-in for the pieces of react-native pulled in by pure-logic
// modules under test (Platform.select in constants/theme.ts, NativeModules
// in i18n/index.ts). Only used by vitest — never bundled by Metro/Expo.
export const Platform = {
  OS: 'web' as const,
  select<T>(spec: Record<string, T | undefined>): T | undefined {
    return spec.web ?? spec.default ?? spec.ios ?? spec.android;
  },
};

export const NativeModules: Record<string, unknown> = {};
