import { useLocalSearchParams, type Href } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlayerSearchInviteList } from '@/components/player-search-invite-list';
import { ScreenHeader } from '@/components/screen-header';
import { Brand } from '@/constants/theme';
import { t } from '@/i18n';
import { goBack } from '@/lib/navigation';

export default function TeamInviteScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const teamId = params.id;

  return (
    <View style={{ flex: 1, backgroundColor: Brand.screenBackground }}>
      <ScreenHeader
        insetTop={insets.top}
        title={t('teams.invite')}
        onBack={() => goBack((teamId ? `/teams/${teamId}` : '/teams') as Href)}
      />
      <View style={{ flex: 1, paddingHorizontal: 16, paddingBottom: insets.bottom }}>
        {teamId ? <PlayerSearchInviteList teamId={teamId} /> : null}
      </View>
    </View>
  );
}
