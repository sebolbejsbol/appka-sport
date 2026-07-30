import { t } from '@/i18n';
import { countryCodeToFlag, countryName } from '@/lib/countries';
import type { ProfileSport, ProfileSkillLevel } from '@/lib/social';
import { formatTeamSport } from '@/lib/sports';

export function profileSportLabel(sport: ProfileSport | null | undefined): string | null {
  if (!sport) return null;
  return formatTeamSport(sport);
}

export function profileSkillLabel(level: ProfileSkillLevel | null | undefined): string | null {
  if (!level) return null;
  switch (level) {
    case 'beginner':
      return t('eventFilters.skillBeginner');
    case 'intermediate':
      return t('eventFilters.skillIntermediate');
    case 'advanced':
      return t('eventFilters.skillAdvanced');
    default:
      return null;
  }
}

export function profileLocationLabel(
  countryCode: string | null | undefined,
  city: string | null | undefined,
): string | null {
  const flag = countryCodeToFlag(countryCode);
  const country = countryName(countryCode);
  const cityTrim = city?.trim();

  if (cityTrim && country) {
    return `${flag} ${cityTrim}, ${country}`.trim();
  }
  if (cityTrim) return cityTrim;
  if (country) return `${flag} ${country}`.trim();
  return null;
}

export type AchievementKey =
  | 'first_match'
  | 'ten_events'
  | 'fifty_events'
  | 'hundred_events'
  | 'five_hundred_events'
  | 'event_organizer'
  | 'organizer_pro'
  | 'organizer_legend'
  | 'punctual_pro'
  | 'early_bird'
  | 'popular_host'
  | 'crowd_puller'
  | 'social_butterfly'
  | 'team_captain'
  | 'team_player'
  | 'explorer'
  | 'veteran'
  | 'organizer_of_month'
  | 'most_active_player';

/** Kolejność od najłatwiejszych do najrzadszych (do wyświetlania zablokowanych). */
export const ALL_ACHIEVEMENTS: AchievementKey[] = [
  'first_match',
  'ten_events',
  'team_captain',
  'event_organizer',
  'explorer',
  'team_player',
  'fifty_events',
  'punctual_pro',
  'popular_host',
  'organizer_pro',
  'early_bird',
  'social_butterfly',
  'veteran',
  'hundred_events',
  'crowd_puller',
  'organizer_of_month',
  'most_active_player',
  'organizer_legend',
  'five_hundred_events',
];

const ACHIEVEMENT_EMOJI: Record<AchievementKey, string> = {
  first_match: '🏅',
  ten_events: '🔟',
  fifty_events: '🎯',
  hundred_events: '💯',
  five_hundred_events: '🐐',
  event_organizer: '📋',
  organizer_pro: '🗂️',
  organizer_legend: '🏛️',
  punctual_pro: '⏰',
  early_bird: '🐦',
  popular_host: '🎪',
  crowd_puller: '🧲',
  social_butterfly: '🦋',
  team_captain: '🧢',
  team_player: '🤝',
  explorer: '🧭',
  veteran: '🎖️',
  organizer_of_month: '🏆',
  most_active_player: '⚡',
};

const ACHIEVEMENT_TITLE_KEY: Record<AchievementKey, Parameters<typeof t>[0]> = {
  first_match: 'profile.achievementFirstMatch',
  ten_events: 'profile.achievementTenEvents',
  fifty_events: 'profile.achievementFiftyEvents',
  hundred_events: 'profile.achievementHundredEvents',
  five_hundred_events: 'profile.achievementFiveHundredEvents',
  event_organizer: 'profile.achievementEventOrganizer',
  organizer_pro: 'profile.achievementOrganizerPro',
  organizer_legend: 'profile.achievementOrganizerLegend',
  punctual_pro: 'profile.achievementPunctual',
  early_bird: 'profile.achievementEarlyBird',
  popular_host: 'profile.achievementPopularHost',
  crowd_puller: 'profile.achievementCrowdPuller',
  social_butterfly: 'profile.achievementSocialButterfly',
  team_captain: 'profile.achievementTeamCaptain',
  team_player: 'profile.achievementTeamPlayer',
  explorer: 'profile.achievementExplorer',
  veteran: 'profile.achievementVeteran',
  organizer_of_month: 'profile.achievementOrganizerOfMonth',
  most_active_player: 'profile.achievementMostActive',
};

export function achievementEmoji(key: AchievementKey): string {
  return ACHIEVEMENT_EMOJI[key] ?? '🎖️';
}

export function achievementTitle(key: AchievementKey): string {
  const tkey = ACHIEVEMENT_TITLE_KEY[key];
  return tkey ? t(tkey) : key;
}

export function parseAchievementKeys(raw: unknown): AchievementKey[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is AchievementKey =>
    typeof item === 'string' && (ALL_ACHIEVEMENTS as string[]).includes(item),
  );
}
