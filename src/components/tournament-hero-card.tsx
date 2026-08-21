import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatWhen, sportEmoji, statusLabel } from '@/components/tournament-card';
import { CalendarIcon, PeopleIcon, PinIcon } from '@/components/icons';
import { Brand, BrandFonts, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';
import { t } from '@/i18n';
import { formatTeamSport } from '@/lib/sports';
import type { TournamentListItem } from '@/lib/tournaments';

type Props = {
  tournament: TournamentListItem;
  onPress: (tournament: TournamentListItem) => void;
};

/**
 * Wyróżniona pozycja nad rail'em zwykłych kart — turniej stworzony przez
 * admina to oficjalne wydarzenie "od najwyższej władzy", ma się rzucać w
 * oczy, nie ginąć jako jedna z 8 małych kart w poziomym scrollu. Rail
 * (TournamentCard) obok tego komponentu pokazuje pozostałe, niewyróżnione
 * turnieje — patrz events/index.tsx.
 */
export function TournamentHeroCard({ tournament, onPress }: Props) {
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
        <View style={styles.badgeRow}>
          <View style={styles.featuredBadge}>
            <Text style={styles.featuredBadgeText}>{t('eventsList.tournamentFeaturedBadge')}</Text>
          </View>
          <View style={styles.statusBadge}>
            <Text style={styles.statusBadgeText}>{statusLabel(tournament.status)}</Text>
          </View>
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

        <View style={styles.divider} />

        <View style={styles.footer}>
          <View style={styles.sportChip}>
            <Text style={styles.sportChipText}>
              {emoji} {formatTeamSport(tournament.sport)}
            </Text>
          </View>
          <View style={styles.teamsRow}>
            <PeopleIcon size={14} color={Brand.textSecondary} />
            <Text style={styles.teams}>
              {tournament.approved_teams_count}/{tournament.max_teams}
            </Text>
          </View>
          <View style={styles.footerSpacer} />
          <View style={styles.ctaBtn}>
            <Text style={styles.ctaText}>{t('eventsList.tournamentFeaturedCta')}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Brand.surface,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: Brand.primary,
    overflow: 'hidden',
    marginHorizontal: 16,
    marginTop: 12,
    ...shadow('md'),
  },
  pressed: {
    opacity: 0.96,
    transform: [{ scale: 0.99 }],
  },
  media: {
    position: 'relative',
    width: '100%',
    aspectRatio: 21 / 9,
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
    fontSize: 72,
  },
  badgeRow: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  featuredBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: '#ffffff',
  },
  featuredBadgeText: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 13,
    color: Brand.primary,
  },
  statusBadge: {
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
    padding: 16,
    gap: 8,
  },
  title: {
    fontFamily: BrandFonts.display,
    fontSize: 23,
    color: Brand.textPrimary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  metaText: {
    flex: 1,
    fontFamily: BrandFonts.body,
    fontSize: 14,
    color: Brand.textSecondary,
  },
  divider: {
    height: 0,
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
    borderTopColor: Brand.divider,
    marginTop: 6,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  footerSpacer: {
    flex: 1,
  },
  sportChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  sportChipText: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 12,
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
  ctaBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Radius.md,
    backgroundColor: Brand.primary,
  },
  ctaText: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 14,
    color: '#ffffff',
  },
});
