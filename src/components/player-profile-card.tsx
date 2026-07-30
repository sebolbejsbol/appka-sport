import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { UserAvatar } from '@/components/user-avatar';
import { Brand, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';
import { t } from '@/i18n';
import {
  achievementEmoji,
  achievementTitle,
  ALL_ACHIEVEMENTS,
  parseAchievementKeys,
  profileLocationLabel,
  type AchievementKey,
} from '@/lib/profile-display';
import type { PublicProfile } from '@/lib/social';

type SocialPress = (tab: 'friends') => void;

type Props = {
  profile: PublicProfile;
  displayName: string;
  ratingText: string;
  statusText: string;
  onSocialPress?: SocialPress;
  /** Gdy podane (własny profil) — dotknięcie awatara pozwala zmienić zdjęcie. */
  onAvatarPress?: () => void;
};

function SocialStat({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress?: () => void;
}) {
  const inner = (
    <>
      <Text style={styles.socialValue}>{value}</Text>
      <Text style={styles.socialLabel}>{label}</Text>
    </>
  );

  if (!onPress) {
    return <View style={styles.socialStat}>{inner}</View>;
  }

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.socialStat, pressed && styles.pressed]}>
      {inner}
    </Pressable>
  );
}

function MetricCard({
  icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: string;
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <View style={[styles.metricCard, accent && styles.metricCardAccent]}>
      <View style={styles.metricHead}>
        <Text style={styles.metricIcon}>{icon}</Text>
        <Text style={[styles.metricValue, accent && styles.metricValueAccent]}>{value}</Text>
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
      {hint ? <Text style={styles.metricHint}>{hint}</Text> : null}
    </View>
  );
}

function AchievementBadge({
  achievementKey,
  locked,
}: {
  achievementKey: AchievementKey;
  locked?: boolean;
}) {
  return (
    <View style={[styles.achievementBadge, locked && styles.achievementBadgeLocked]}>
      <Text style={[styles.achievementEmoji, locked && styles.achievementEmojiLocked]}>
        {locked ? '🔒' : achievementEmoji(achievementKey)}
      </Text>
      <Text
        style={[styles.achievementText, locked && styles.achievementTextLocked]}
        numberOfLines={2}>
        {achievementTitle(achievementKey)}
      </Text>
    </View>
  );
}

export function PlayerProfileCard({
  profile,
  displayName,
  ratingText,
  statusText,
  onSocialPress,
  onAvatarPress,
}: Props) {
  const location = profileLocationLabel(profile.country_code, profile.city);
  const bio = profile.bio?.trim();
  const unlocked = parseAchievementKeys(profile.achievements);
  const unlockedSet = new Set<AchievementKey>(unlocked);
  const orderedAchievements = [...ALL_ACHIEVEMENTS].sort((a, b) => {
    const av = unlockedSet.has(a) ? 0 : 1;
    const bv = unlockedSet.has(b) ? 0 : 1;
    return av - bv;
  });
  const achievementProgress = Math.round((unlocked.length / ALL_ACHIEVEMENTS.length) * 100);

  return (
    <View style={styles.wrap}>
      <View style={styles.banner}>
        <View style={styles.bannerGlow} />
      </View>

      <View style={styles.avatarWrap}>
        <Pressable
          onPress={onAvatarPress}
          disabled={!onAvatarPress}
          style={({ pressed }) => [styles.avatarRing, pressed && onAvatarPress && styles.pressed]}>
          <UserAvatar
            nick={profile.nick}
            avatarUrl={profile.avatar_url}
            size={104}
            showOnline
            isOnline={profile.is_online}
          />
          {onAvatarPress ? (
            <View style={styles.avatarCamera}>
              <Text style={styles.avatarCameraIcon}>📷</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <View style={styles.identity}>
        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.status}>{statusText}</Text>
        {location ? <Text style={styles.location}>{location}</Text> : null}
        {bio ? <Text style={styles.bio}>{bio}</Text> : null}
      </View>

      <View style={styles.socialRow}>
        <SocialStat
          label={t('social.friends')}
          value={String(profile.friend_count)}
          onPress={profile.is_self && onSocialPress ? () => onSocialPress('friends') : undefined}
        />
      </View>

      <Text style={styles.sectionTitle}>{t('profile.statsTitle')}</Text>
      <Text style={styles.sectionSubtitle}>{t('profile.statsSubtitle')}</Text>
      <View style={styles.metricsGrid}>
        <MetricCard
          icon="🎮"
          label={t('profile.eventsPlayed')}
          value={String(profile.events_played)}
          accent
        />
        <MetricCard
          icon="✅"
          label={t('profile.attendanceRate')}
          value={`${profile.attendance_rate}%`}
        />
        <MetricCard
          icon="📋"
          label={t('profile.eventsCreated')}
          value={String(profile.events_created)}
        />
        <MetricCard icon="⭐" label={t('profile.avgRating')} value={ratingText} accent />
      </View>

      <View style={styles.achievementsHeader}>
        <Text style={styles.sectionTitle}>{t('profile.achievementsTitle')}</Text>
        <Text style={styles.achievementsCount}>
          {unlocked.length}/{ALL_ACHIEVEMENTS.length}
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${achievementProgress}%` }]} />
      </View>
      {unlocked.length === 0 ? (
        <Text style={styles.emptyAchievements}>{t('profile.achievementsEmpty')}</Text>
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.achievementsRow}>
        {orderedAchievements.map((key) => (
          <AchievementBadge key={key} achievementKey={key} locked={!unlockedSet.has(key)} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 8,
  },
  banner: {
    height: 120,
    marginHorizontal: -20,
    marginBottom: -52,
    backgroundColor: '#0f172a',
    overflow: 'hidden',
  },
  bannerGlow: {
    position: 'absolute',
    right: -40,
    top: -20,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: Brand.primary,
    opacity: 0.35,
  },
  avatarWrap: {
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarRing: {
    padding: 4,
    borderRadius: 999,
    backgroundColor: Brand.screenBackground,
    borderWidth: 3,
    borderColor: Brand.primary,
  },
  avatarCamera: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Brand.screenBackground,
  },
  avatarCameraIcon: {
    fontSize: 15,
  },
  identity: {
    alignItems: 'center',
    gap: 4,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  name: {
    fontSize: 24,
    fontWeight: '800',
    color: Brand.textPrimary,
    textAlign: 'center',
  },
  status: {
    fontSize: 13,
    color: Brand.textMuted,
    textAlign: 'center',
  },
  location: {
    fontSize: 15,
    color: Brand.textSecondary,
    textAlign: 'center',
    marginTop: 2,
  },
  bio: {
    fontSize: 14,
    color: Brand.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 10,
    paddingHorizontal: 4,
  },
  socialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Brand.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Brand.border,
    paddingVertical: 14,
    marginBottom: 20,
    ...shadow('sm'),
  },
  socialStat: {
    flex: 1,
    alignItems: 'center',
  },
  socialValue: {
    fontSize: 18,
    fontWeight: '800',
    color: Brand.textPrimary,
  },
  socialLabel: {
    fontSize: 11,
    color: Brand.textMuted,
    marginTop: 2,
  },
  socialDivider: {
    width: 1,
    height: 28,
    backgroundColor: Brand.border,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Brand.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: Brand.textMuted,
    marginTop: -6,
    marginBottom: 12,
  },
  metricHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metricIcon: {
    fontSize: 16,
  },
  metricHint: {
    fontSize: 10,
    color: Brand.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Brand.surfaceMuted,
    overflow: 'hidden',
    marginBottom: 14,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: Brand.primary,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  metricCard: {
    width: '47%',
    flexGrow: 1,
    backgroundColor: Brand.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Brand.border,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  metricCardAccent: {
    borderColor: Brand.primary,
    backgroundColor: '#fff8f5',
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '800',
    color: Brand.textPrimary,
  },
  metricValueAccent: {
    color: Brand.primary,
  },
  metricLabel: {
    fontSize: 11,
    color: Brand.textMuted,
    marginTop: 4,
    textAlign: 'center',
  },
  achievementsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  achievementsCount: {
    fontSize: 13,
    fontWeight: '800',
    color: Brand.primary,
    marginBottom: 10,
  },
  achievementsRow: {
    gap: 10,
    paddingBottom: 4,
    marginBottom: 16,
  },
  achievementBadge: {
    width: 108,
    minHeight: 96,
    backgroundColor: '#fff8f5',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fed7aa',
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  achievementBadgeLocked: {
    backgroundColor: Brand.surfaceMuted,
    borderColor: Brand.border,
    opacity: 0.7,
  },
  achievementEmoji: {
    fontSize: 28,
  },
  achievementEmojiLocked: {
    fontSize: 24,
  },
  achievementText: {
    fontSize: 11,
    fontWeight: '600',
    color: Brand.textSecondary,
    textAlign: 'center',
    lineHeight: 15,
  },
  achievementTextLocked: {
    color: Brand.textMuted,
  },
  emptyAchievements: {
    fontSize: 14,
    color: Brand.textMuted,
    marginBottom: 16,
    fontStyle: 'italic',
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
});
