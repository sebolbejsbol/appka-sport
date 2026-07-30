import { StyleSheet, Text, View } from 'react-native';

import { Brand, Radius } from '@/constants/theme';
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
      <Badge text={skillLevelLabel(event.skill_level)} />
      <Badge
        text={paymentStatusLabel(event.payment_status)}
        variant={event.payment_status === 'paid' ? 'paid' : 'free'}
      />
      <Badge text={eventTypeLabel(event.event_type)} muted />
      <Badge text={freeSpotsLabel(event)} />
    </View>
  );
}

function Badge({
  text,
  variant = 'default',
  muted = false,
}: {
  text: string;
  variant?: 'default' | 'free' | 'paid' | 'friends' | 'waitlist' | 'blocked';
  muted?: boolean;
}) {
  return (
    <View
      style={[
        styles.badge,
        variant === 'paid' && styles.badgePaid,
        variant === 'free' && styles.badgeFree,
        variant === 'friends' && styles.badgeFriends,
        variant === 'waitlist' && styles.badgeWaitlist,
        variant === 'blocked' && styles.badgeBlocked,
        muted && styles.badgeMuted,
      ]}>
      <Text
        style={[
          styles.badgeText,
          variant === 'paid' && styles.badgeTextPaid,
          variant === 'free' && styles.badgeTextFree,
          variant === 'friends' && styles.badgeTextFriends,
          muted && styles.badgeTextMuted,
        ]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    backgroundColor: Brand.primaryLight,
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  badgeFree: {
    backgroundColor: Brand.successLight,
    borderColor: '#a7f3d0',
  },
  badgePaid: {
    backgroundColor: Brand.warningLight,
    borderColor: '#fde68a',
  },
  badgeFriends: {
    backgroundColor: Brand.infoLight,
    borderColor: '#bfdbfe',
  },
  badgeWaitlist: {
    backgroundColor: Brand.surfaceMuted,
    borderColor: Brand.border,
  },
  badgeBlocked: {
    backgroundColor: Brand.warningLight,
    borderColor: '#fde68a',
  },
  badgeMuted: {
    backgroundColor: Brand.surfaceMuted,
    borderColor: Brand.border,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Brand.primaryDark,
  },
  badgeTextPaid: {
    color: Brand.warning,
  },
  badgeTextFree: {
    color: Brand.success,
  },
  badgeTextFriends: {
    color: Brand.info,
  },
  badgeTextMuted: {
    color: Brand.textSecondary,
  },
});
