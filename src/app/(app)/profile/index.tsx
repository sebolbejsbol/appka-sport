import { useSession } from '@/context/session';
import { t } from '@/i18n';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PublicProfileView } from '@/components/public-profile-view';
import { Brand } from '@/constants/theme';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { session, isLoading } = useSession();
  const userId = session?.user?.id;

  if (isLoading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={Brand.primary} />
      </View>
    );
  }

  if (!userId) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.muted}>{t('profile.loadError')}</Text>
      </View>
    );
  }

  return <PublicProfileView userId={userId} isRootTab />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.screenBackground,
  },
  muted: {
    color: Brand.textMuted,
    fontSize: 15,
  },
});
