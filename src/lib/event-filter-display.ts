import { t } from '@/i18n';
import { formatSpotsFree } from '@/lib/plural-pl';
import { sportFilterLabel } from '@/lib/sports';
import {
  freeSpotsCount,
  type DateFilter,
  type EventFilters,
  type EventType,
  type FilterableEvent,
  type PaymentFilter,
  type PaymentStatus,
  type SkillLevel,
} from '@/lib/event-filters';

export function skillLevelLabel(level: SkillLevel | 'all'): string {
  switch (level) {
    case 'beginner':
      return t('eventFilters.skillBeginner');
    case 'intermediate':
      return t('eventFilters.skillIntermediate');
    case 'advanced':
      return t('eventFilters.skillAdvanced');
    default:
      return t('eventFilters.skillAll');
  }
}

export function eventTypeLabel(type: EventType | 'all'): string {
  switch (type) {
    case 'match':
      return t('eventFilters.typeMatch');
    case 'training':
      return t('eventFilters.typeTraining');
    case 'tournament':
      return t('eventFilters.typeTournament');
    case 'sparring':
      return t('eventFilters.typeSparring');
    case 'looking_for_players':
      return t('eventFilters.typeLooking');
    default:
      return t('eventFilters.typeAll');
  }
}

export function paymentFilterLabel(payment: PaymentFilter): string {
  switch (payment) {
    case 'free':
      return t('eventFilters.paymentFree');
    case 'paid':
      return t('eventFilters.paymentPaid');
    default:
      return t('eventFilters.paymentAll');
  }
}

export function paymentStatusLabel(status: PaymentStatus): string {
  return status === 'paid' ? t('eventFilters.paymentPaid') : t('eventFilters.paymentFree');
}

export function dateFilterLabel(date: DateFilter): string {
  switch (date) {
    case 'today':
      return t('eventFilters.dateToday');
    case 'tomorrow':
      return t('eventFilters.dateTomorrow');
    case 'week':
      return t('eventFilters.dateWeek');
    default:
      return t('eventFilters.dateAll');
  }
}

export function distanceFilterLabel(km: number | null): string {
  if (km == null) return t('eventFilters.distanceUnlimited');
  const rounded = Math.round(km * 2) / 2;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return t('eventFilters.distanceKm').replace('{km}', text);
}

export function freeSpotsLabel(
  event: Pick<FilterableEvent, 'max_players' | 'participant_count'>,
): string {
  const free = freeSpotsCount(event);
  if (free == null) return t('eventFilters.spotsUnlimited');
  if (free === 0) return t('eventFilters.spotsFull');
  return formatSpotsFree(free);
}

export function buildActiveFilterSummary(filters: EventFilters): string {
  const parts: string[] = [];
  if (filters.sport !== 'basketball') parts.push(sportFilterLabel(filters.sport));
  if (filters.skillLevel !== 'all') parts.push(skillLevelLabel(filters.skillLevel));
  if (filters.eventType !== 'all') parts.push(eventTypeLabel(filters.eventType));
  if (filters.payment !== 'all') parts.push(paymentFilterLabel(filters.payment));
  if (filters.date !== 'all') parts.push(dateFilterLabel(filters.date));
  if (filters.distanceKm != null) parts.push(distanceFilterLabel(filters.distanceKm));
  if (filters.onlyFreeSpots) parts.push(t('eventFilters.onlyFreeSpots'));
  return parts.join(' · ');
}
