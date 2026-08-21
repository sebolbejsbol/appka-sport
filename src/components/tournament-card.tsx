import { memo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { CalendarIcon, PeopleIcon, PinIcon } from '@/components/icons';
import { Brand, BrandFonts, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';
import { t } from '@/i18n';
import { formatEventDateTime, parseLocalDateTime } from '@/lib/datetime';
import { formatTeamSport } from '@/lib/sports';
import type { TournamentListItem, TournamentStatus } from '@/lib/tournaments';

type Props = {
  tournament: TournamentListItem;
  onPress: (tournament: TournamentListItem) => void;
};

const SPORT_EMOJI: Record<string, string> = {
  basketball: '🏀',
  football: '⚽',
  volleyball: '🏐',
  handball: '🤾',
};

export function sportEmoji(sport: string): string {
  return SPORT_EMOJI[sport] ?? '🏆';
}

export function statusLabel(status: TournamentStatus): string {
  switch (status) {
    case 'draft': return t('tournamentStatus.draft');
    case 'registration_open': return t('tournamentStatus.registrationOpen');
    case 'registration_closed': return t('tournamentStatus.registrationClosed');
    case 'ready': return t('tournamentStatus.ready');
    case 'in_progress': return t('tournamentStatus.inProgress');
    case 'completed': return t('tournamentStatus.completed');
    case 'cancelled': return t('tournamentStatus.cancelled');
  }
}

export function formatWhen(tournament: TournamentListItem): string {
  const iso = parseLocalDateTime(tournament.event_date, tournament.start_time.slice(0, 5));
  return iso ? formatEventDateTime(iso) : tournament.event_date;
}

function TournamentCardComponent({ tournament, onPress }: Props) {
  const emoji = sportEmoji(tournament.sport);
  const place = [tournament.location_name, tournament.city].filter(Boolean).join(', ');

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={() => onPress(tournament)}>
      <View style={styles.media}>
        {tournament.logo_url ? (
          <Image source={{ uri: tournament.logo_url }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={styles.imageFallback}>
            <Text style={styles.fallbackEmoji}>{emoji}</Text>
          </View>
        )}
        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText}>{statusLabel(tournament.status)}</Text>
        </View>
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {tournament.name}
        </Text>

        <View style={styles.metaRow}>
          <CalendarIcon size={14} color={Brand.textMuted} />
          <Text style={styles.metaText} numberOfLines={1}>
            {formatWhen(tournament)}
          </Text>
        </View>

        {place ? (
          <View style={styles.metaRow}>
            <PinIcon size={14} color={Brand.textMuted} />
            <Text style={styles.metaText} numberOfLines={1}>
              {place}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Ta sama perforacja "linii boiska" co event-card.tsx — spójny system. */}
      <View style={styles.perforationRow}>
        <View style={styles.notchLeft} />
        <View style={styles.perforationLine} />
        <View style={styles.notchRight} />
      </View>

      <View style={styles.stub}>
        <View style={styles.sportChip}>
          <Text style={styles.sportChipText}>
            {emoji} {formatTeamSport(tournament.sport)}
          </Text>
        </View>
        <View style={styles.footerSpacer} />
        <View style={styles.teamsRow}>
          <PeopleIcon size={14} color={Brand.textSecondary} />
          <Text style={styles.teams}>
            {tournament.approved_teams_count}/{tournament.max_teams}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

// Memo: analogiczne uzasadnienie co w EventCard — karty turniejów też żyją
// na przewijanych listach/rail'ach, które odświeżają się co fokus ekranu.
export const TournamentCard = memo(TournamentCardComponent);

const styles = StyleSheet.create({
  card: {
    backgroundColor: Brand.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Brand.border,
    overflow: 'hidden',
    ...shadow('sm'),
  },
  pressed: {
    opacity: 0.96,
    transform: [{ scale: 0.985 }],
  },
  media: {
    position: 'relative',
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: Brand.surfaceMuted,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.primaryLight,
  },
  fallbackEmoji: {
    fontSize: 52,
  },
  statusBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    backgroundColor: Brand.primary,
  },
  statusBadgeText: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 12,
    color: '#ffffff',
  },
  body: {
    padding: 14,
    paddingBottom: 12,
    gap: 6,
  },
  title: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 16,
    color: Brand.textPrimary,
    letterSpacing: -0.2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  metaText: {
    flex: 1,
    fontFamily: BrandFonts.body,
    fontSize: 13,
    color: Brand.textSecondary,
  },
  perforationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 1,
  },
  perforationLine: {
    flex: 1,
    height: 0,
    borderTopWidth: 1.5,
    borderTopColor: Brand.border,
    borderStyle: 'dashed',
    marginHorizontal: -4,
  },
  notchLeft: {
    width: 14,
    height: 14,
    borderRadius: 999,
    backgroundColor: Brand.screenBackground,
    marginLeft: -7,
  },
  notchRight: {
    width: 14,
    height: 14,
    borderRadius: 999,
    backgroundColor: Brand.screenBackground,
    marginRight: -7,
  },
  stub: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 14,
    paddingTop: 12,
  },
  footerSpacer: {
    flex: 1,
  },
  sportChip: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  sportChipText: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 11,
    color: Brand.textSecondary,
  },
  teamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  teams: {
    fontFamily: BrandFonts.monoSemibold,
    fontVariant: ['tabular-nums'],
    fontSize: 13,
    color: Brand.textSecondary,
  },
});
