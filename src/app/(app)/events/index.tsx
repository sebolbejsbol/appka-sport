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

import { BOTTOM_NAV_HEIGHT } from '@/components/app-side-menu';
import { EventCard } from '@/components/event-card';
import { EventsMap } from '@/components/events-map';
import { CloseIcon, PeopleIcon, SearchIcon } from '@/components/icons';
import { TeamAvatar } from '@/components/team-avatar';
import { Brand, BrandFonts, Layout, Radius } from '@/constants/theme';
import { shadow, Typography } from '@/constants/ui';
import { useUserLocation } from '@/hooks/use-user-location';
import {
  categoryLabel,
  categoryMeta,
  markerEmoji,
  subcategoryLabel,
  subcategoriesFor,
} from '@/lib/event-categories';
import { getActiveTeams, type ActiveTeam } from '@/lib/teams';
import { formatTeamSport } from '@/lib/sports';
import { TournamentCard } from '@/components/tournament-card';
import { TournamentHeroCard } from '@/components/tournament-hero-card';
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
      [...tournamentsResult.data]
        .filter((tItem) => tItem.status !== 'completed')
        .sort((a, b) => a.event_date.localeCompare(b.event_date))
        .slice(0, 8),
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

  // Turniej stworzony przez admina to oficjalne wydarzenie — ma wyjść na
  // pierwszy plan zamiast tonąć jako jedna z kart w poziomym rail'u.
  // Preferujemy ten z otwartymi zapisami (tam gracze mają się zgłaszać
  // najpilniej); jeśli żaden nie ma otwartych zapisów, bierzemy najbliższy
  // nadchodzący (lista już posortowana rosnąco po dacie).
  const featuredTournament = useMemo(
    () => tournaments.find((tItem) => tItem.status === 'registration_open') ?? tournaments[0] ?? null,
    [tournaments],
  );
  const railTournaments = useMemo(
    () => tournaments.filter((tItem) => tItem.id !== featuredTournament?.id),
    [tournaments, featuredTournament],
  );

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
        <View style={styles.heroBand}>
          <View style={styles.titleRow}>
            <View style={styles.titleBlock}>
              <Text style={styles.title}>{t('eventsList.title')}</Text>
              <View style={styles.subtitleRow}>
                <Text style={styles.subtitleCount}>{visibleEvents.length}</Text>
                <Text style={styles.subtitle}>
                  {visibleEvents.length === 1 ? t('eventsList.countOne') : t('eventsList.countMany')}
                  {activeCount > 0 ? ` · ${activeCount} ${t('eventsList.filtersShort')}` : ''}
                </Text>
              </View>
            </View>
            <Pressable
              style={({ pressed }) => [styles.createBtn, pressed && styles.pressed]}
              onPress={() => router.push('/event/create')}>
              <Text style={styles.createBtnText}>＋ {t('eventsList.create')}</Text>
            </Pressable>
          </View>

          <View style={styles.searchRow}>
            <SearchIcon size={17} color={Brand.textSecondary} />
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
                hitSlop={8}
                style={({ pressed }) => pressed && styles.pressed}>
                <CloseIcon size={14} color={Brand.textMuted} />
              </Pressable>
            ) : null}
          </View>
        </View>

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
                style={({ pressed }) => [
                  styles.sortChip,
                  filters.sort === id && styles.sortChipActive,
                  pressed && styles.pressed,
                ]}
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
              style={({ pressed }) => [
                styles.viewBtn,
                view === 'list' && styles.viewBtnActive,
                pressed && styles.pressed,
              ]}
              onPress={() => setView('list')}>
              <Text style={[styles.viewBtnText, view === 'list' && styles.viewBtnTextActive]}>
                {t('eventsList.viewList')}
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.viewBtn,
                view === 'map' && styles.viewBtnActive,
                pressed && styles.pressed,
              ]}
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
          {featuredTournament ? (
            <TournamentHeroCard tournament={featuredTournament} onPress={openTournament} />
          ) : null}
          {railTournaments.length > 0 ? (
            <TournamentsRail tournaments={railTournaments} onOpenTournament={openTournament} />
          ) : null}
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
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + BOTTOM_NAV_HEIGHT + 24 },
          ]}
          removeClippedSubviews
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={7}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Brand.primary} />
          }
          ListHeaderComponent={
            <>
              {featuredTournament ? (
                <TournamentHeroCard tournament={featuredTournament} onPress={openTournament} />
              ) : null}
              {railTournaments.length > 0 ? (
                <TournamentsRail tournaments={railTournaments} onOpenTournament={openTournament} />
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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.shelfRow}>
        {tournaments.map((tItem) => (
          <View key={tItem.id} style={styles.tournamentRailItem}>
            <TournamentCard tournament={tItem} onPress={onOpenTournament} />
          </View>
        ))}
      </ScrollView>
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
      <View style={styles.popDivider} />
      <View style={styles.popMetaRow}>
        <View style={[styles.popBadge, { backgroundColor: meta.color }]}>
          <Text style={styles.popBadgeText}>{categoryLabel(event.category)}</Text>
        </View>
        <View style={styles.popCountRow}>
          <PeopleIcon size={12} color={Brand.textSecondary} />
          <Text style={styles.popCount}>{event.participant_count}</Text>
        </View>
      </View>
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
    marginBottom: 4,
  },
  // Ciemny blok na całą szerokość zamiast białego tła pod tytułem — to jest
  // ta zmiana, którą ma być widać z pierwszego rzutu oka, nie porównując ze
  // starą wersją. Zaokrąglenie tylko na dole, żeby nie kolidowało z paskiem
  // statusu/insets nad nim.
  heroBand: {
    backgroundColor: Brand.ink,
    paddingHorizontal: Layout.screenPaddingX,
    paddingTop: 18,
    paddingBottom: 18,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    gap: 14,
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
    fontFamily: BrandFonts.display,
    fontSize: 34,
    color: '#ffffff',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
    marginTop: 2,
  },
  subtitleCount: {
    fontFamily: BrandFonts.monoSemibold,
    fontVariant: ['tabular-nums'],
    fontSize: 13,
    color: Brand.amber,
  },
  subtitle: {
    fontFamily: BrandFonts.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.68)',
  },
  createBtn: {
    backgroundColor: Brand.amber,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Radius.pill,
    ...shadow('sm'),
  },
  createBtnText: {
    fontFamily: BrandFonts.bodyBold,
    color: Brand.ink,
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
    backgroundColor: Brand.success,
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
    gap: 9,
    paddingHorizontal: 14,
    height: 46,
    backgroundColor: Brand.surface,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Brand.border,
    ...shadow('sm'),
  },
  searchInput: {
    flex: 1,
    fontFamily: BrandFonts.body,
    fontSize: 15,
    color: Brand.textPrimary,
    paddingVertical: 0,
  },
  subChipsRow: {
    gap: 8,
    paddingTop: 14,
    paddingBottom: 12,
    paddingLeft: Layout.screenPaddingX,
    paddingRight: 8,
  },
  subChip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surfaceMuted,
  },
  subChipActive: {
    backgroundColor: Brand.ink,
    borderColor: Brand.ink,
  },
  subChipText: {
    fontFamily: BrandFonts.bodySemibold,
    fontSize: 12,
    color: Brand.textSecondary,
  },
  subChipTextActive: {
    color: '#ffffff',
  },
  // Pasek pod nagłówkiem jak zakładki na wynikach meczu: aktywna opcja to
  // kreska pod spodem (Bursztyn Amber), nie wypełniona plakietka — inny
  // język niż chipy filtrów wyżej, celowo (rozróżnia "filtr" od "widok/sort").
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: Layout.screenPaddingX,
    borderBottomWidth: 1.5,
    borderStyle: 'dashed',
    borderBottomColor: Brand.border,
  },
  sortRow: {
    flexDirection: 'row',
    gap: 4,
  },
  sortChip: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  sortChipActive: {
    borderBottomColor: Brand.amber,
  },
  sortChipText: {
    fontFamily: BrandFonts.bodySemibold,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    color: Brand.textMuted,
  },
  sortChipTextActive: {
    color: Brand.textPrimary,
  },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: Brand.surfaceMuted,
    borderRadius: Radius.pill,
    padding: 2,
    marginBottom: 8,
  },
  viewBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: Radius.pill,
  },
  viewBtnActive: {
    backgroundColor: Brand.ink,
  },
  viewBtnText: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 12,
    color: Brand.textMuted,
  },
  viewBtnTextActive: {
    color: '#ffffff',
  },
  loader: {
    marginTop: 40,
  },
  shelf: {
    marginBottom: 18,
  },
  tournamentRailItem: {
    width: 220,
  },
  shelfTitle: {
    fontFamily: BrandFonts.display,
    fontSize: 20,
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
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Brand.border,
    padding: 10,
    ...shadow('sm'),
  },
  popDivider: {
    height: 0,
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
    borderTopColor: Brand.divider,
    marginTop: 8,
    marginHorizontal: -10,
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
    backgroundColor: Brand.success,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  popTitle: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 14,
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
    fontFamily: BrandFonts.bodyBold,
    fontSize: 10,
    color: '#ffffff',
  },
  popCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  popCount: {
    fontFamily: BrandFonts.monoSemibold,
    fontVariant: ['tabular-nums'],
    fontSize: 12,
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
    fontFamily: BrandFonts.bodyBold,
    fontSize: 14,
    color: Brand.textPrimary,
  },
  teamChipMeta: {
    fontFamily: BrandFonts.body,
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
