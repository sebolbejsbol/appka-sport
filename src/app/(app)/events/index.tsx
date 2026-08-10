import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EventCard } from '@/components/event-card';
import { EventsMap } from '@/components/events-map';
import { TeamAvatar } from '@/components/team-avatar';
import { Brand, Layout, Radius } from '@/constants/theme';
import { shadow, Typography } from '@/constants/ui';
import { useUserLocation } from '@/hooks/use-user-location';
import {
  EVENT_CATEGORIES,
  CATEGORY_META,
  categoryLabel,
  categoryMeta,
  markerEmoji,
  subcategoryLabel,
  subcategoriesFor,
  type CategoryFilter,
  type EventCategory,
} from '@/lib/event-categories';
import { getActiveTeams, type ActiveTeam } from '@/lib/teams';
import { formatTeamSport } from '@/lib/sports';
import { TournamentCard } from '@/components/tournament-card';
import { listTournaments, type TournamentListItem } from '@/lib/tournaments';
import { t } from '@/i18n';
import {
  applyDiscoverFilters,
  countActiveDiscoverFilters,
  getDiscoverEvents,
  sortDiscoverEvents,
  DEFAULT_DISCOVER_FILTERS,
  type DiscoverEvent,
  type DiscoverFilters,
  type DiscoverSort,
} from '@/lib/discover-events';
import { logInteraction } from '@/lib/interactions';

const SORT_IDS: DiscoverSort[] = ['date', 'distance', 'popularity'];

function sortLabel(id: DiscoverSort): string {
  switch (id) {
    case 'distance':
      return t('eventsList.sortNearest');
    case 'popularity':
      return t('eventsList.sortPopular');
    default:
      return t('eventsList.sortDate');
  }
}

export default function EventsScreen() {
  const insets = useSafeAreaInsets();
  const { coords } = useUserLocation();

  const [events, setEvents] = useState<DiscoverEvent[]>([]);
  const [tournaments, setTournaments] = useState<TournamentListItem[]>([]);
  const [activeTeams, setActiveTeams] = useState<ActiveTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [filters, setFilters] = useState<DiscoverFilters>(DEFAULT_DISCOVER_FILTERS);

  const load = useCallback(async () => {
    const [{ data, error }, teams, tournamentsResult] = await Promise.all([
      getDiscoverEvents(),
      getActiveTeams(8),
      listTournaments(null, false),
    ]);
    setEvents(data);
    setActiveTeams(teams);
    setTournaments(
      [...tournamentsResult.data].sort((a, b) => a.event_date.localeCompare(b.event_date)),
    );
    setLoadError(!!error);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const visibleEvents = useMemo(() => {
    const filtered = applyDiscoverFilters(events, filters, { userCoords: coords });
    return sortDiscoverEvents(filtered, filters.sort, coords);
  }, [events, filters, coords]);

  const activeCount = countActiveDiscoverFilters(filters);
  const subcats = filters.category !== 'all' ? subcategoriesFor(filters.category) : [];

  const popularEvents = useMemo(
    () =>
      [...events]
        .sort(
          (a, b) =>
            b.participant_count - a.participant_count ||
            a.starts_at.localeCompare(b.starts_at),
        )
        .slice(0, 8),
    [events],
  );

  const showDiscoveryShelf =
    activeCount === 0 && filters.search.trim() === '' && view === 'list';

  function selectCategory(category: CategoryFilter) {
    setFilters((prev) => ({ ...prev, category, subcategory: null }));
    if (category !== 'all') {
      void logInteraction({ kind: 'search_category', category });
    }
  }

  const openEvent = useCallback((event: DiscoverEvent) => {
    void logInteraction({
      kind: 'view_event',
      eventId: event.id,
      category: event.category,
      subcategory: event.subcategory,
    });
    router.push({ pathname: '/event/[id]', params: { id: event.id } });
  }, []);

  const openTournament = useCallback((tournament: TournamentListItem) => {
    router.push({ pathname: '/tournament/[id]', params: { id: tournament.id } });
  }, []);

  function openTeam(teamId: string) {
    void logInteraction({ kind: 'view_team', teamId });
    router.push({ pathname: '/teams/[id]/chat', params: { id: teamId } });
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + Layout.menuClearance }]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>{t('eventsList.title')}</Text>
            <Text style={styles.subtitle}>
              {visibleEvents.length}{' '}
              {visibleEvents.length === 1 ? t('eventsList.countOne') : t('eventsList.countMany')}
              {activeCount > 0 ? ` · ${activeCount} ${t('eventsList.filtersShort')}` : ''}
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.createBtn, pressed && styles.pressed]}
            onPress={() => router.push('/event/create')}>
            <Text style={styles.createBtnText}>＋ {t('eventsList.create')}</Text>
          </Pressable>
        </View>

        <View style={styles.searchRow}>
          <Text style={styles.searchIcon}>🔎</Text>
          <TextInput
            style={styles.searchInput}
            placeholder={t('eventsList.searchPlaceholder')}
            placeholderTextColor={Brand.textMuted}
            value={filters.search}
            onChangeText={(search) => setFilters((prev) => ({ ...prev, search }))}
            returnKeyType="search"
          />
          {filters.search.length > 0 ? (
            <Pressable
              onPress={() => setFilters((prev) => ({ ...prev, search: '' }))}
              hitSlop={8}>
              <Text style={styles.clearSearch}>✕</Text>
            </Pressable>
          ) : null}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}>
          <CategoryChip
            label={t('eventCategories.all')}
            emoji="✦"
            color={Brand.primary}
            active={filters.category === 'all'}
            onPress={() => selectCategory('all')}
          />
          {EVENT_CATEGORIES.map((cat) => (
            <CategoryChip
              key={cat}
              label={categoryLabel(cat)}
              emoji={CATEGORY_META[cat].emoji}
              color={CATEGORY_META[cat].color}
              active={filters.category === cat}
              onPress={() => selectCategory(cat as EventCategory)}
            />
          ))}
        </ScrollView>

        {subcats.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.subChipsRow}>
            <SubChip
              label={t('eventCategories.all')}
              active={filters.subcategory === null}
              onPress={() => setFilters((prev) => ({ ...prev, subcategory: null }))}
            />
            {subcats.map((sub) => (
              <SubChip
                key={sub.id}
                label={subcategoryLabel(sub.id) ?? sub.id}
                active={filters.subcategory === sub.id}
                onPress={() => setFilters((prev) => ({ ...prev, subcategory: sub.id }))}
              />
            ))}
          </ScrollView>
        ) : null}

        <View style={styles.toolbar}>
          <View style={styles.sortRow}>
            {SORT_IDS.map((id) => (
              <Pressable
                key={id}
                style={[styles.sortChip, filters.sort === id && styles.sortChipActive]}
                onPress={() => setFilters((prev) => ({ ...prev, sort: id }))}>
                <Text
                  style={[
                    styles.sortChipText,
                    filters.sort === id && styles.sortChipTextActive,
                  ]}>
                  {sortLabel(id)}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.viewToggle}>
            <Pressable
              style={[styles.viewBtn, view === 'list' && styles.viewBtnActive]}
              onPress={() => setView('list')}>
              <Text style={[styles.viewBtnText, view === 'list' && styles.viewBtnTextActive]}>
                {t('eventsList.viewList')}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.viewBtn, view === 'map' && styles.viewBtnActive]}
              onPress={() => setView('map')}>
              <Text style={[styles.viewBtnText, view === 'map' && styles.viewBtnTextActive]}>
                {t('eventsList.viewMap')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      ) : view === 'map' ? (
        <EventsMap
          events={visibleEvents}
          tournaments={tournaments}
          userCoords={coords}
          onSelectEvent={openEvent}
          onSelectTournament={openTournament}
        />
      ) : loadError && events.length === 0 ? (
        <View style={styles.emptyBlock}>
          <Text style={styles.emptyTitle}>{t('eventsList.loadFailTitle')}</Text>
          <Text style={styles.emptyHint}>{t('eventsList.loadFailHint')}</Text>
        </View>
      ) : visibleEvents.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyScroll}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Brand.primary} />
          }>
          <View style={styles.emptyBlock}>
            <Text style={styles.emptyTitle}>{t('eventsList.emptyTitle')}</Text>
            <Text style={styles.emptyHint}>{t('eventsList.emptyCreateHint')}</Text>
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={visibleEvents}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          removeClippedSubviews
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={7}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Brand.primary} />
          }
          ListHeaderComponent={
            <>
              {tournaments.length > 0 ? (
                <TournamentsRail tournaments={tournaments} onOpenTournament={openTournament} />
              ) : null}
              {showDiscoveryShelf ? (
                <PopularShelf
                  events={popularEvents}
                  teams={activeTeams}
                  onOpenEvent={openEvent}
                  onOpenTeam={openTeam}
                />
              ) : null}
            </>
          }
          renderItem={({ item }) => (
            <EventCard event={item} userCoords={coords} onPress={openEvent} />
          )}
        />
      )}
    </View>
  );
}

function PopularShelf({
  events,
  teams,
  onOpenEvent,
  onOpenTeam,
}: {
  events: DiscoverEvent[];
  teams: ActiveTeam[];
  onOpenEvent: (event: DiscoverEvent) => void;
  onOpenTeam: (teamId: string) => void;
}) {
  if (events.length === 0 && teams.length === 0) return null;
  return (
    <View style={styles.shelf}>
      {events.length > 0 ? (
        <>
          <Text style={styles.shelfTitle}>🔥 {t('eventsList.popularNearby')}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.shelfRow}>
            {events.map((e) => (
              <PopularCard key={e.id} event={e} onPress={() => onOpenEvent(e)} />
            ))}
          </ScrollView>
        </>
      ) : null}

      {teams.length > 0 ? (
        <>
          <Text style={[styles.shelfTitle, styles.shelfTitleSpaced]}>🛡️ {t('eventsList.mostActiveTeams')}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.shelfRow}>
            {teams.map((team) => (
              <Pressable
                key={team.team_id}
                onPress={() => onOpenTeam(team.team_id)}
                style={({ pressed }) => [styles.teamChip, pressed && styles.pressed]}>
                <TeamAvatar name={team.name} logoUrl={team.logo_url} size={40} />
                <View style={styles.teamChipText}>
                  <Text style={styles.teamChipName} numberOfLines={1}>
                    {team.name}
                  </Text>
                  <Text style={styles.teamChipMeta} numberOfLines={1}>
                    {formatTeamSport(team.sport)} · {team.member_count}
                  </Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </>
      ) : null}
    </View>
  );
}

function TournamentsRail({
  tournaments,
  onOpenTournament,
}: {
  tournaments: TournamentListItem[];
  onOpenTournament: (tournament: TournamentListItem) => void;
}) {
  return (
    <View style={styles.shelf}>
      <Text style={styles.shelfTitle}>🏆 {t('eventsList.tournamentsRailTitle')}</Text>
      <View style={styles.tournamentRailList}>
        {tournaments.map((tItem) => (
          <View key={tItem.id} style={styles.tournamentRailItem}>
            <TournamentCard tournament={tItem} onPress={onOpenTournament} />
          </View>
        ))}
      </View>
    </View>
  );
}

function PopularCard({ event, onPress }: { event: DiscoverEvent; onPress: () => void }) {
  const meta = categoryMeta(event.category);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.popCard, pressed && styles.pressed]}>
      <View style={[styles.popThumb, { backgroundColor: meta.tint }]}>
        <Text style={styles.popEmoji}>{markerEmoji(event.category, event.subcategory)}</Text>
        {event.is_instant ? <View style={styles.popLiveDot} /> : null}
      </View>
      <Text style={styles.popTitle} numberOfLines={2}>
        {event.title?.trim() || categoryLabel(event.category)}
      </Text>
      <View style={styles.popMetaRow}>
        <View style={[styles.popBadge, { backgroundColor: meta.color }]}>
          <Text style={styles.popBadgeText}>{categoryLabel(event.category)}</Text>
        </View>
        <Text style={styles.popCount}>👥 {event.participant_count}</Text>
      </View>
    </Pressable>
  );
}

function CategoryChip({
  label,
  emoji,
  color,
  active,
  onPress,
}: {
  label: string;
  emoji: string;
  color: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[
        styles.catChip,
        active && { backgroundColor: color, borderColor: color },
      ]}
      onPress={onPress}>
      <Text style={[styles.catChipText, active && styles.catChipTextActive]}>
        {emoji} {label}
      </Text>
    </Pressable>
  );
}

function SubChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.subChip, active && styles.subChipActive]} onPress={onPress}>
      <Text style={[styles.subChipText, active && styles.subChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Brand.screenBackground,
  },
  header: {
    paddingHorizontal: Layout.screenPaddingX,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  titleBlock: {
    flex: 1,
  },
  title: {
    ...Typography.screenTitle,
  },
  subtitle: {
    ...Typography.caption,
    marginTop: 2,
  },
  createBtn: {
    backgroundColor: Brand.primary,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: Radius.pill,
    ...shadow('sm'),
  },
  createBtnText: {
    color: Brand.primaryText,
    fontWeight: '800',
    fontSize: 13,
  },
  playRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  playNowBtn: {
    flex: 1,
    backgroundColor: '#16a34a',
    paddingVertical: 12,
    borderRadius: Radius.pill,
    alignItems: 'center',
    ...shadow('sm'),
  },
  playNowText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 12,
    height: 44,
    backgroundColor: Brand.surface,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  searchIcon: {
    fontSize: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: Brand.textPrimary,
    paddingVertical: 0,
  },
  clearSearch: {
    fontSize: 15,
    color: Brand.textMuted,
    paddingHorizontal: 4,
  },
  chipsRow: {
    gap: 8,
    paddingVertical: 12,
    paddingRight: 8,
  },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
    ...shadow('sm'),
  },
  catChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: Brand.textSecondary,
  },
  catChipTextActive: {
    color: '#ffffff',
  },
  subChipsRow: {
    gap: 8,
    paddingBottom: 12,
    paddingRight: 8,
  },
  subChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surfaceMuted,
  },
  subChipActive: {
    backgroundColor: Brand.primary,
    borderColor: Brand.primary,
  },
  subChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Brand.textSecondary,
  },
  subChipTextActive: {
    color: '#ffffff',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sortRow: {
    flexDirection: 'row',
    gap: 6,
  },
  sortChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Brand.surfaceMuted,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  sortChipActive: {
    backgroundColor: Brand.primaryLight,
    borderColor: Brand.primaryMuted,
  },
  sortChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Brand.textSecondary,
  },
  sortChipTextActive: {
    color: Brand.primaryDark,
  },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: Brand.surfaceMuted,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Brand.border,
    padding: 2,
  },
  viewBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: Radius.pill,
  },
  viewBtnActive: {
    backgroundColor: Brand.surface,
    ...shadow('sm'),
  },
  viewBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Brand.textMuted,
  },
  viewBtnTextActive: {
    color: Brand.textPrimary,
  },
  loader: {
    marginTop: 40,
  },
  shelf: {
    marginBottom: 18,
  },
  tournamentRailList: {
    gap: 14,
  },
  tournamentRailItem: {
    width: '100%',
  },
  shelfTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Brand.textPrimary,
    marginBottom: 10,
  },
  shelfTitleSpaced: {
    marginTop: 18,
  },
  shelfRow: {
    gap: 12,
    paddingRight: 8,
  },
  popCard: {
    width: 168,
    backgroundColor: Brand.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Brand.border,
    padding: 10,
    ...shadow('sm'),
  },
  popThumb: {
    height: 84,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  popEmoji: {
    fontSize: 36,
  },
  popLiveDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#16a34a',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  popTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Brand.textPrimary,
    minHeight: 36,
  },
  popMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  popBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  popBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#ffffff',
  },
  popCount: {
    fontSize: 12,
    fontWeight: '700',
    color: Brand.textSecondary,
  },
  teamChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Brand.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Brand.border,
    paddingVertical: 8,
    paddingHorizontal: 10,
    width: 190,
    ...shadow('sm'),
  },
  teamChipText: {
    flex: 1,
  },
  teamChipName: {
    fontSize: 14,
    fontWeight: '700',
    color: Brand.textPrimary,
  },
  teamChipMeta: {
    fontSize: 12,
    color: Brand.textMuted,
    marginTop: 1,
  },
  listContent: {
    gap: 14,
    paddingHorizontal: Layout.screenPaddingX,
    paddingBottom: 24,
  },
  emptyScroll: {
    flexGrow: 1,
    paddingHorizontal: Layout.screenPaddingX,
  },
  emptyBlock: {
    marginTop: 32,
    padding: 24,
    alignItems: 'center',
    backgroundColor: Brand.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Brand.border,
    gap: 8,
    ...shadow('sm'),
  },
  emptyTitle: {
    ...Typography.cardTitle,
    textAlign: 'center',
  },
  emptyHint: {
    ...Typography.bodySecondary,
    textAlign: 'center',
  },
});
