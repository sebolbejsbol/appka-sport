import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PublicProfileView } from '@/components/public-profile-view';
import { Brand } from '@/constants/theme';
import { t } from '@/i18n';

export default function UserProfileScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const userId = params.id;

  if (!userId) {
    return (
      <View style={{ flex: 1, paddingTop: insets.top, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: Brand.textMuted }}>{t('social.loadError')}</Text>
      </View>
    );
  }

  return <PublicProfileView userId={userId} />;
}
