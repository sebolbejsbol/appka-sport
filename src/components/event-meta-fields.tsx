import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Brand } from '@/constants/theme';
import { t } from '@/i18n';
import {
  eventTypeLabel,
  paymentStatusLabel,
  skillLevelLabel,
} from '@/lib/event-filter-display';
import type { EventType, PaymentStatus, SkillLevel } from '@/lib/event-filters';
import type { EventVisibility } from '@/lib/events';

type Props = {
  skillLevel: SkillLevel;
  eventType: EventType;
  paymentStatus: PaymentStatus;
  visibility: EventVisibility;
  onSkillLevel: (value: SkillLevel) => void;
  onEventType: (value: EventType) => void;
  onPaymentStatus: (value: PaymentStatus) => void;
  onVisibility: (value: EventVisibility) => void;
  disabled?: boolean;
};

const SKILL_OPTIONS: SkillLevel[] = ['any', 'beginner', 'intermediate', 'advanced'];
const TYPE_OPTIONS: EventType[] = [
  'match',
  'training',
  'tournament',
  'sparring',
  'looking_for_players',
];
const PAYMENT_OPTIONS: PaymentStatus[] = ['free', 'paid'];
const VISIBILITY_OPTIONS: EventVisibility[] = ['public', 'friends_only'];

function visibilityLabel(value: EventVisibility): string {
  return value === 'friends_only'
    ? t('event.visibilityFriendsShort')
    : t('event.visibilityPublicShort');
}

export function EventMetaFields({
  skillLevel,
  eventType,
  paymentStatus,
  visibility,
  onSkillLevel,
  onEventType,
  onPaymentStatus,
  onVisibility,
  disabled = false,
}: Props) {
  return (
    <View style={styles.container}>
      <ChipGroup
        label={t('event.visibilityLabel')}
        options={VISIBILITY_OPTIONS}
        value={visibility}
        labelFor={visibilityLabel}
        onChange={onVisibility}
        disabled={disabled}
      />
      <ChipGroup
        label={t('event.skillLevelLabel')}
        options={SKILL_OPTIONS}
        value={skillLevel}
        labelFor={skillLevelLabel}
        onChange={onSkillLevel}
        disabled={disabled}
      />
      <ChipGroup
        label={t('event.eventTypeLabel')}
        options={TYPE_OPTIONS}
        value={eventType}
        labelFor={eventTypeLabel}
        onChange={onEventType}
        disabled={disabled}
      />
      <ChipGroup
        label={t('event.paymentStatusLabel')}
        options={PAYMENT_OPTIONS}
        value={paymentStatus}
        labelFor={paymentStatusLabel}
        onChange={onPaymentStatus}
        disabled={disabled}
      />
    </View>
  );
}

type ChipGroupProps<T extends string> = {
  label: string;
  options: T[];
  value: T;
  labelFor: (value: T) => string;
  onChange: (value: T) => void;
  disabled?: boolean;
};

function ChipGroup<T extends string>({
  label,
  options,
  value,
  labelFor,
  onChange,
  disabled,
}: ChipGroupProps<T>) {
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.segmented}>
        {options.map((option) => {
          const selected = value === option;
          return (
            <Pressable
              key={option}
              onPress={() => onChange(option)}
              disabled={disabled}
              style={[styles.segment, selected && styles.segmentSelected]}>
              <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                {labelFor(option)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 20,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Brand.textSecondary,
    marginBottom: 10,
  },
  segmented: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  segment: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
  },
  segmentSelected: {
    backgroundColor: Brand.primary,
    borderColor: Brand.primary,
  },
  segmentText: {
    fontSize: 13,
    color: Brand.textPrimary,
  },
  segmentTextSelected: {
    color: Brand.primaryText,
    fontWeight: '600',
  },
});
