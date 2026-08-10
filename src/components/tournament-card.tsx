import { memo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Brand, Radius } from '@/constants/theme';
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

function sportEmoji(sport: string): string {
  return SPORT_EMOJI[sport] ?? '🏆';
}

function statusLabel(status: TournamentStatus): string {
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

function formatWhen(tournament: TournamentListItem): string {
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
          <Text style={styles.metaIcon}>📅</Text>
          <Text style={styles.metaText} numberOfLines={1}>
            {formatWhen(tournament)}
          </Text>
        </View>

        {place ? (
          <View style={styles.metaRow}>
            <Text style={styles.metaIcon}>📍</Text>
            <Text style={styles.metaText} numberOfLines={1}>
              {place}
            </Text>
          </View>
        ) : null}

        <View style={styles.footer}>
          <View style={styles.sportChip}>
            <Text style={styles.sportChipText}>
              {emoji} {formatTeamSport(tournament.sport)}
            </Text>
          </View>
          <View style={styles.footerSpacer} />
          <Text style={styles.teams}>👥 0/{tournament.max_teams}</Text>
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
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  body: {
    padding: 14,
    gap: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: Brand.textPrimary,
    letterSpacing: -0.2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaIcon: {
    fontSize: 13,
  },
  metaText: {
    flex: 1,
    fontSize: 13,
    color: Brand.textSecondary,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
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
    fontSize: 11,
    fontWeight: '700',
    color: Brand.textSecondary,
  },
  teams: {
    fontSize: 12,
    fontWeight: '700',
    color: Brand.textSecondary,
  },
});
