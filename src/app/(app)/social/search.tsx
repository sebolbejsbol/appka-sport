import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/screen-header';
import { UserAvatar } from '@/components/user-avatar';
import { Brand, BrandFonts, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';
import { t } from '@/i18n';
import { goBack } from '@/lib/navigation';
import { searchProfiles, type ProfileSearchHit } from '@/lib/social';

type SearchIntent = 'profile' | 'message';

export default function ProfileSearchScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ intent?: string }>();
  const intent: SearchIntent = params.intent === 'message' ? 'message' : 'profile';

  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ProfileSearchHit[]>([]);
  const [searching, setSearching] = useState(false);

  async function handleQuery(text: string) {
    setQuery(text);
    if (text.trim().length < 2) {
      setHits([]);
      return;
    }
    setSearching(true);
    const { data } = await searchProfiles(text);
    setHits(data);
    setSearching(false);
  }

  function openProfile(userId: string) {
    router.push({ pathname: '/user/[id]', params: { id: userId } });
  }

  const title = intent === 'message' ? t('messages.newMessage') : t('social.searchTitle');
  const placeholder =
    intent === 'message' ? t('messages.searchPlaceholder') : t('social.searchPlaceholder');

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <ScreenHeader
        insetTop={insets.top}
        title={title}
        onBack={() => goBack(intent === 'message' ? ('/messages' as Href) : '/social')}
      />

      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          value={query}
          onChangeText={handleQuery}
          placeholder={placeholder}
          placeholderTextColor={Brand.textMuted}
          style={styles.search}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          returnKeyType="search"
        />
      </View>

      {query.trim().length > 0 && query.trim().length < 2 ? (
        <Text style={styles.hint}>{t('social.searchHint')}</Text>
      ) : null}

      {searching ? (
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      ) : (
        <FlatList
          data={hits}
          keyExtractor={(item) => item.user_id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            query.trim().length >= 2 ? (
              <Text style={styles.empty}>{t('social.emptySearch')}</Text>
            ) : (
              <Text style={styles.hint}>{t('social.searchIntro')}</Text>
            )
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openProfile(item.user_id)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <UserAvatar nick={item.nick} avatarUrl={item.avatar_url} size={52} />
              <View style={styles.rowMain}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.nick?.trim() || t('common.nick')}
                </Text>
                <Text style={styles.rowMeta}>{t('social.viewProfile')}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Brand.screenBackground,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Brand.border,
    borderRadius: Radius.pill,
    backgroundColor: Brand.surface,
    paddingHorizontal: 16,
    ...shadow('sm'),
  },
  searchIcon: {
    fontSize: 22,
    color: Brand.textMuted,
    marginRight: 8,
  },
  search: {
    fontFamily: BrandFonts.body,
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: Brand.textPrimary,
  },
  hint: {
    fontFamily: BrandFonts.body,
    color: Brand.textMuted,
    textAlign: 'center',
    marginTop: 24,
    paddingHorizontal: 24,
    fontSize: 15,
    lineHeight: 22,
  },
  loader: {
    marginTop: 32,
  },
  empty: {
    fontFamily: BrandFonts.body,
    color: Brand.textMuted,
    textAlign: 'center',
    marginTop: 32,
    fontSize: 15,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 24,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
    ...shadow('sm'),
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  rowMain: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  chevron: {
    fontSize: 24,
    color: Brand.textMuted,
    marginLeft: 4,
  },
  rowName: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 16,
    fontWeight: '700',
    color: Brand.textPrimary,
  },
  rowMeta: {
    fontFamily: BrandFonts.body,
    fontSize: 13,
    color: Brand.textMuted,
  },
});
