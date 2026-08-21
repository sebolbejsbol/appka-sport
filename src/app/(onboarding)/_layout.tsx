import { Stack } from 'expo-router';

import { Brand } from '@/constants/theme';

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Brand.screenBackground },
      }}
    />
  );
}
