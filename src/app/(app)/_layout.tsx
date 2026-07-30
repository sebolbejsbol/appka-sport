import { Stack } from 'expo-router';
import { View } from 'react-native';

import { AppMenuProvider } from '@/components/app-side-menu';
import { DisclaimerPromptHost } from '@/components/disclaimer-prompt-host';
import { EventInvitePromptHost } from '@/components/event-invite-prompt-host';
import { FieldRatingPromptHost } from '@/components/field-rating-prompt-host';
import { EventFiltersProvider } from '@/context/event-filters';
import { usePresenceHeartbeat } from '@/hooks/use-presence-heartbeat';
import { useProfileLanguage } from '@/hooks/use-profile-language';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { Brand } from '@/constants/theme';

export default function AppLayout() {
  usePushNotifications();
  usePresenceHeartbeat();
  useProfileLanguage();

  return (
    <EventFiltersProvider>
      <AppMenuProvider>
        <View style={{ flex: 1 }}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: Brand.screenBackground },
            }}
          />
          <FieldRatingPromptHost />
          <EventInvitePromptHost />
          <DisclaimerPromptHost />
        </View>
      </AppMenuProvider>
    </EventFiltersProvider>
  );
}
