import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BOTTOM_NAV_HEIGHT } from '@/components/app-side-menu';
import { ScreenHeader } from '@/components/screen-header';
import { TeamAvatar } from '@/components/team-avatar';
import { Brand, Layout, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';
import { t } from '@/i18n';
import { formatTeamSport } from '@/lib/sports';
import {
  cancelJoinRequest,
  getSuggestedTeams,
  listIncomingTeamInvitations,
  listMyTeams,
  requestJoinTeam,
  respondTeamInvitation,
  searchTeams,
  type DiscoverTeam,
  type IncomingTeamInvitation,
  type TeamListItem,
} from '@/lib/teams';

export default function TeamsListScreen() {
  const insets = useSafeAreaInsets();
  const [teams, setTeams] = useState<TeamListItem[]>([]);
  const [invites, setInvites] = useState<IncomingTeamInvitation[]>([]);
  const [suggested, setSuggested] = useState<DiscoverTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DiscoverTeam[]>([]);
  const [searching, setSearching] = useState(false);

  const searchMode = query.trim().length >= 2;

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(false);
    const [teamsRes, invitesRes, suggestedRes] = await Promise.all([
      listMyTeams(),
      listIncomingTeamInvitations(),
      getSuggestedTeams(10),
    ]);
    setTeams(teamsRes.data);
    setInvites(invitesRes.data);
    setSuggested(suggestedRes);
    setError(Boolean(teamsRes.error || invitesRes.error));
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const data = await searchTeams(q);
    setResults(data);
    setSearching(false);
  }, []);

  function handleQueryChange(value: string) {
    setQuery(value);
    void runSearch(value);
  }

  async function handleRespond(invitationId: string, accept: boolean) {
    await respondTeamInvitation(invitationId, accept);
    void refresh(true);
  }

  async function handleJoin(team: DiscoverTeam) {
    const result = await requestJoinTeam(team.team_id);
    const status: DiscoverTeam['request_status'] = result === 'sent' ? 'pending' : team.request_status;
    setSuggested((prev) =>
      prev.map((x) => (x.team_id === team.team_id ? { ...x, request_status: status } : x)),
    );
    setResults((prev) =>
      prev.map((x) => (x.team_id === team.team_id ? { ...x, request_status: status } : x)),
    );
  }

  async function handleCancelRequest(team: DiscoverTeam) {
    await cancelJoinRequest(team.team_id);
    setSuggested((prev) =>
      prev.map((x) => (x.team_id === team.team_id ? { ...x, request_status: null } : x)),
    );
    setResults((prev) =>
      prev.map((x) => (x.team_id === team.team_id ? { ...x, request_status: null } : x)),
    );
  }

  function openTeam(team: DiscoverTeam) {
    if (team.is_member) {
      router.push({ pathname: '/teams/[id]/chat', params: { id: team.team_id } });
    }
  }

  const subtitle =
    teams.length === 0
      ? undefined
      : `${teams.length} ${teams.length === 1 ? t('teams.countOne') : t('teams.countMany')}`;

  const renderDiscover = (item: DiscoverTeam) => (
    <Pressable
      key={item.team_id}
      onPress={() => openTeam(item)}
      disabled={!item.is_member}
      style={({ pressed }) => [styles.row, pressed && item.is_member && styles.pressed]}>
      <TeamAvatar name={item.name} logoUrl={item.logo_url} size={48} />
      <View style={styles.rowMain}>
        <Text style={styles.teamName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {formatTeamSport(item.sport)} · {item.member_count} {t('teams.memberCount').toLowerCase()}
        </Text>
      </View>
      {item.is_member ? (
        <View style={styles.memberPill}>
          <Text style={styles.memberPillText}>{t('teams.memberBadge')}</Text>
        </View>
      ) : item.request_status === 'pending' ? (
        <Pressable
          onPress={() => void handleCancelRequest(item)}
          style={({ pressed }) => [styles.pendingBtn, pressed && styles.pressed]}>
          <Text style={styles.pendingText}>{t('teams.requestPending')}</Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={() => void handleJoin(item)}
          style={({ pressed }) => [styles.joinBtn, pressed && styles.pressed]}>
          <Text style={styles.joinText}>{t('teams.requestJoin')}</Text>
        </Pressable>
      )}
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <ScreenHeader
        insetTop={insets.top}
        title={t('teams.title')}
        subtitle={subtitle}
        rightActions={[
          {
            key: 'create',
            icon: '+',
            primary: true,
            accessibilityLabel: t('teams.create'),
            onPress: () => router.push('/teams/create' as Href),
          },
        ]}
      />

      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          value={query}
          onChangeText={handleQueryChange}
          placeholder={t('teams.searchPlaceholder')}
          placeholderTextColor={Brand.textMuted}
          style={styles.searchInput}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {query.length > 0 ? (
          <Pressable
            onPress={() => handleQueryChange('')}
            hitSlop={8}
            style={({ pressed }) => pressed && styles.pressed}>
            <Text style={styles.searchClear}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      ) : error ? (
        <Text style={styles.empty}>{t('teams.loadError')}</Text>
      ) : searchMode ? (
        <FlatList
          data={results}
          keyExtractor={(item) => item.team_id}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + BOTTOM_NAV_HEIGHT + 24 }]}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <Text style={styles.sectionTitle}>
              {searching ? t('common.loading') : t('teams.searchResults')}
            </Text>
          }
          ListEmptyComponent={
            searching ? null : (
              <Text style={styles.searchEmpty}>{t('teams.searchEmpty')}</Text>
            )
          }
          renderItem={({ item }) => renderDiscover(item)}
        />
      ) : (
        <FlatList
          data={teams}
          keyExtractor={(item) => item.team_id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void refresh(true);
              }}
              tintColor={Brand.primary}
            />
          }
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + BOTTOM_NAV_HEIGHT + 24 }]}
          ListHeaderComponent={
            <View>
              {invites.length > 0 ? (
              <View style={styles.invitesBlock}>
                <Text style={styles.sectionTitle}>{t('teams.incomingInvites')}</Text>
                {invites.map((inv) => (
                  <View key={inv.invitation_id} style={styles.inviteRow}>
                    <TeamAvatar name={inv.team_name} logoUrl={inv.team_logo_url} size={44} />
                    <View style={styles.inviteMain}>
                      <Text style={styles.teamName}>{inv.team_name}</Text>
                      <Text style={styles.inviteMeta}>
                        {inv.from_nick?.trim() || t('common.nick')}
                      </Text>
                    </View>
                    <View style={styles.inviteActions}>
                      <Pressable
                        onPress={() => void handleRespond(inv.invitation_id, true)}
                        style={({ pressed }) => [styles.acceptBtn, pressed && styles.pressed]}>
                        <Text style={styles.acceptText}>{t('teams.acceptInvite')}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => void handleRespond(inv.invitation_id, false)}
                        style={({ pressed }) => [styles.rejectBtn, pressed && styles.pressed]}>
                        <Text style={styles.rejectText}>{t('teams.rejectInvite')}</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
              ) : null}
              {teams.length > 0 ? (
                <Text style={styles.sectionTitle}>{t('teams.yourTeams')}</Text>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIcon}>
                <Text style={styles.emptyIconText}>🛡️</Text>
              </View>
              <Text style={styles.empty}>{t('teams.empty')}</Text>
              <Text style={styles.emptyHint}>{t('teams.emptyHint')}</Text>
              <Pressable
                onPress={() => router.push('/teams/create' as Href)}
                style={({ pressed }) => [styles.createBtn, pressed && styles.pressed]}>
                <Text style={styles.createBtnText}>{t('teams.create')}</Text>
              </Pressable>
            </View>
          }
          ListFooterComponent={
            suggested.length > 0 ? (
              <View style={styles.suggestBlock}>
                <Text style={styles.sectionTitle}>{t('teams.suggestedTitle')}</Text>
                {suggested.map(renderDiscover)}
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                router.push({ pathname: '/teams/[id]/chat', params: { id: item.team_id } })
              }
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <TeamAvatar name={item.name} logoUrl={item.logo_url} size={52} />
              <View style={styles.rowMain}>
                <Text style={styles.teamName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {formatTeamSport(item.sport)} · {item.member_count}{' '}
                  {t('teams.memberCount').toLowerCase()}
                </Text>
              </View>
              {item.my_role !== 'member' ? (
                <View style={styles.rolePill}>
                  <Text style={styles.rolePillText}>
                    {item.my_role === 'owner' ? t('teams.roleOwner') : t('teams.roleAdmin')}
                  </Text>
                </View>
              ) : null}
              {item.unread_count > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.unread_count}</Text>
                </View>
              ) : null}
              <Pressable
                onPress={() => router.push(`/teams/${item.team_id}` as Href)}
                hitSlop={10}
                accessibilityLabel={t('teams.settings')}
                style={({ pressed }) => [styles.gearBtn, pressed && styles.pressed]}>
                <Text style={styles.gearIcon}>⚙</Text>
              </Pressable>
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
  loader: {
    marginTop: 32,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: Layout.screenPaddingX,
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: Radius.pill,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  searchIcon: {
    fontSize: 15,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: Brand.textPrimary,
    paddingVertical: 0,
  },
  searchClear: {
    fontSize: 14,
    color: Brand.textMuted,
    paddingHorizontal: 4,
  },
  searchEmpty: {
    color: Brand.textMuted,
    fontSize: 14,
    paddingTop: 24,
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: Layout.screenPaddingX,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Brand.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
    marginTop: 4,
  },
  invitesBlock: {
    gap: 10,
    marginBottom: 18,
  },
  suggestBlock: {
    gap: 10,
    marginTop: 18,
  },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: Radius.lg,
    backgroundColor: Brand.primaryLight,
    borderWidth: 1,
    borderColor: Brand.primaryMuted,
  },
  inviteMain: {
    flex: 1,
    gap: 2,
  },
  inviteMeta: {
    fontSize: 13,
    color: Brand.textMuted,
  },
  inviteActions: {
    alignItems: 'flex-end',
    gap: 4,
  },
  acceptBtn: {
    backgroundColor: Brand.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  acceptText: {
    color: Brand.primaryText,
    fontSize: 12,
    fontWeight: '700',
  },
  rejectBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  rejectText: {
    color: Brand.textMuted,
    fontSize: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
    ...shadow('sm'),
  },
  rowMain: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  teamName: {
    fontSize: 16,
    fontWeight: '700',
    color: Brand.textPrimary,
  },
  rowMeta: {
    fontSize: 13,
    color: Brand.textMuted,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: Brand.primaryText,
    fontSize: 12,
    fontWeight: '700',
  },
  joinBtn: {
    backgroundColor: Brand.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.pill,
  },
  joinText: {
    color: Brand.primaryText,
    fontSize: 13,
    fontWeight: '700',
  },
  pendingBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
  },
  pendingText: {
    color: Brand.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  rolePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    backgroundColor: Brand.primaryLight,
  },
  rolePillText: {
    color: Brand.primary,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  memberPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Brand.primaryLight,
  },
  memberPillText: {
    color: Brand.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  gearBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.primaryLight,
  },
  gearIcon: {
    fontSize: 18,
    color: Brand.primary,
  },
  emptyWrap: {
    paddingHorizontal: 24,
    paddingTop: 48,
    alignItems: 'center',
    gap: 10,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Brand.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyIconText: {
    fontSize: 32,
  },
  empty: {
    color: Brand.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyHint: {
    color: Brand.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  createBtn: {
    marginTop: 12,
    backgroundColor: Brand.primary,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: Radius.pill,
    ...shadow('sm'),
  },
  createBtnText: {
    color: Brand.primaryText,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
});
