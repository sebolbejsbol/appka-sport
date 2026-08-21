import { StyleSheet, Text, View } from 'react-native';

import { Brand, BrandFonts, Radius } from '@/constants/theme';
import { t } from '@/i18n';
import type { FilterableEvent } from '@/lib/event-filters';
import type { EventVisibility } from '@/lib/events';
import {
  eventTypeLabel,
  freeSpotsLabel,
  paymentStatusLabel,
  skillLevelLabel,
} from '@/lib/event-filter-display';

export type EventMetaBadgeSource = Pick<
  FilterableEvent,
  'skill_level' | 'event_type' | 'payment_status' | 'max_players' | 'participant_count'
> & {
  visibility?: EventVisibility;
  is_waitlisted?: boolean;
  has_blocked_co_player?: boolean;
};

type Props = {
  event: EventMetaBadgeSource;
};

/**
 * Redesign 2026-08-21: te same znaczki wcześniej były bladymi plakietkami
 * (przezroczyste tło + cienka obwódka, w tym relikt starej pomarańczowej
 * palety — `#fed7aa`, ten sam już naprawiony gdzie indziej w tej sesji) —
 * wyglądały słabo i ginęły na tle karty. Teraz to wypełnione, kontrastowe
 * plakietki w konkretnych kolorach marki (zielony = darmowe/otwarte,
 * bursztyn = płatne, morski = tylko znajomi), tym samym językiem co
 * sportChip w event-card.tsx/tournament-card.tsx.
 */
export function EventMetaBadges({ event }: Props) {
  return (
    <View style={styles.row}>
      {event.visibility === 'friends_only' ? (
        <Badge text={t('event.friendsOnlyBadge')} variant="friends" />
      ) : null}
      {event.is_waitlisted ? (
        <Badge text={t('event.onWaitlist')} variant="waitlist" />
      ) : null}
      {event.has_blocked_co_player ? (
        <Badge text={t('event.blockedCoPlayerBadge')} variant="blocked" />
      ) : null}
      <Badge text={skillLevelLabel(event.skill_level)} variant="neutral" />
      <Badge
        text={paymentStatusLabel(event.payment_status)}
        variant={event.payment_status === 'paid' ? 'paid' : 'free'}
      />
      <Badge text={eventTypeLabel(event.event_type)} variant="neutral" />
      <Badge text={freeSpotsLabel(event)} variant="neutral" />
    </View>
  );
}

type Variant = 'neutral' | 'free' | 'paid' | 'friends' | 'waitlist' | 'blocked';

function Badge({ text, variant }: { text: string; variant: Variant }) {
  return (
    <View style={[styles.badge, VARIANT_STYLES[variant].badge]}>
      <Text style={[styles.badgeText, VARIANT_STYLES[variant].text]}>{text}</Text>
    </View>
  );
}

const VARIANT_STYLES = {
  neutral: {
    badge: { backgroundColor: Brand.surfaceMuted, borderColor: Brand.border },
    text: { color: Brand.textSecondary },
  },
  free: {
    badge: { backgroundColor: Brand.pitch, borderColor: Brand.pitch },
    text: { color: '#ffffff' },
  },
  paid: {
    badge: { backgroundColor: Brand.amber, borderColor: Brand.amber },
    text: { color: Brand.ink },
  },
  friends: {
    badge: { backgroundColor: Brand.teal, borderColor: Brand.teal },
    text: { color: '#ffffff' },
  },
  waitlist: {
    badge: { backgroundColor: Brand.ink, borderColor: Brand.ink },
    text: { color: '#ffffff' },
  },
  blocked: {
    badge: { backgroundColor: Brand.amberLight, borderColor: Brand.amber },
    text: { color: Brand.amberDark },
  },
} as const satisfies Record<Variant, { badge: object; text: object }>;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 10,
  },
  badge: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  badgeText: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
});
