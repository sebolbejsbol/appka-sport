import type { User } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

export type Gender = 'male' | 'female' | 'other';

export type AppRole = 'user' | 'admin' | 'super_admin';

export type Profile = {
  id: string;
  nick: string | null;
  birth_year: number | null;
  show_birth_year: boolean;
  gender: Gender | null;
  avatar_url: string | null;
  country_code: string | null;
  city: string | null;
  bio: string | null;
  favorite_sport: 'basketball' | 'football' | 'volleyball' | 'handball' | null;
  skill_level: 'beginner' | 'intermediate' | 'advanced' | null;
  sports: string[];
  language: 'pl' | 'en';
  is_admin: boolean;
  role: AppRole;
};

const PROFILE_COLUMNS =
  'id, nick, birth_year, show_birth_year, gender, avatar_url, country_code, city, bio, favorite_sport, skill_level, sports, language, is_admin, role';

/**
 * Pobiera profil użytkownika, a jeśli go jeszcze nie ma — tworzy na podstawie
 * danych z konta (nick i rok urodzenia podane przy rejestracji).
 */
export async function getOrCreateProfile(
  user: User,
): Promise<{ data: Profile | null; error: { message: string } | null }> {
  const existing = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', user.id)
    .maybeSingle<Profile>();

  if (existing.error) {
    return { data: null, error: existing.error };
  }
  if (existing.data) {
    return { data: existing.data, error: null };
  }

  const metadata = user.user_metadata ?? {};
  const nick = typeof metadata.nick === 'string' && metadata.nick ? metadata.nick : null;
  const birthYear = Number(metadata.birth_year);
  const countryRaw =
    typeof metadata.country_code === 'string' ? metadata.country_code.toUpperCase().trim() : null;
  const countryCode =
    countryRaw && /^[A-Z]{2}$/.test(countryRaw) ? countryRaw : null;

  const ALLOWED_SPORTS = [
    'basketball', 'football', 'volleyball', 'tennis', 'running', 'padel', 'badminton', 'fitness', 'handball',
  ];
  const sports = Array.isArray(metadata.sports)
    ? (metadata.sports.filter(
        (s): s is string => typeof s === 'string' && ALLOWED_SPORTS.includes(s),
      ) as string[])
    : [];

  const language =
    metadata.language === 'pl' || metadata.language === 'en' ? metadata.language : 'pl';

  const created = await supabase
    .from('profiles')
    .insert({
      id: user.id,
      nick,
      birth_year: Number.isFinite(birthYear) ? birthYear : null,
      country_code: countryCode,
      sports,
      language,
    })
    .select(PROFILE_COLUMNS)
    .single<Profile>();

  return { data: created.data, error: created.error };
}

export type ProfileUpdate = {
  show_birth_year: boolean;
  gender: Gender | null;
  city: string | null;
  bio: string | null;
  sports: string[];
};

export type UpdateProfileResult = 'ok' | 'invalid' | 'error';

export async function isNickAvailable(
  nick: string,
  excludeUserId?: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_nick_available', {
    p_nick: nick.trim(),
    p_exclude_user_id: excludeUserId ?? null,
  });
  if (error) return false;
  return Boolean(data);
}

export type ClaimProfileResult =
  | 'ok'
  | 'nick_taken'
  | 'invalid_nick'
  | 'already_set'
  | 'error';

/**
 * Jednorazowe uzupełnienie nicku (+ opcjonalnie roku urodzenia i kraju) dla
 * konta, które nie ma jeszcze nicku — typowo po pierwszym logowaniu przez
 * Google/Facebook/Apple. Działa tylko RAZ: gdy nick jest już ustawiony,
 * baza odrzuca wywołanie (nick jest zablokowany na stałe od tego momentu).
 */
export async function claimProfileBasics(
  nick: string,
  birthYear: number | null,
  countryCode: string | null,
): Promise<{ result: ClaimProfileResult; error: { message: string } | null }> {
  const { error } = await supabase.rpc('claim_profile_basics', {
    p_nick: nick.trim(),
    p_birth_year: birthYear,
    p_country_code: countryCode,
  });
  if (!error) return { result: 'ok', error: null };

  const msg = error.message ?? '';
  if (msg.includes('nick_taken')) return { result: 'nick_taken', error };
  if (msg.includes('invalid_nick')) return { result: 'invalid_nick', error };
  if (msg.includes('nick_already_set')) return { result: 'already_set', error };
  return { result: 'error', error };
}

export async function updateProfile(
  patch: ProfileUpdate,
): Promise<{ error: { message: string } | null; result: UpdateProfileResult }> {
  const { error } = await supabase.rpc('update_own_profile', {
    p_show_birth_year: patch.show_birth_year,
    p_gender: patch.gender,
    p_city: patch.city,
    p_bio: patch.bio,
    p_sports: patch.sports,
  });

  if (!error) return { error: null, result: 'ok' };

  const msg = error.message ?? '';
  if (
    msg.includes('invalid_gender') ||
    msg.includes('invalid_city') ||
    msg.includes('invalid_bio') ||
    msg.includes('invalid_sport') ||
    msg.includes('invalid_skill_level')
  ) {
    return { error, result: 'invalid' };
  }
  return { error, result: 'error' };
}

export async function setOwnAvatar(
  avatarUrl: string | null,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase.rpc('set_own_avatar', { p_avatar_url: avatarUrl });
  return { error };
}

/** Zapisuje preferowany język interfejsu w profilu (po zalogowaniu). */
export async function setOwnLanguage(
  language: 'pl' | 'en',
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase.rpc('set_own_language', { p_language: language });
  return { error };
}

/** Pobiera zapisany w profilu język interfejsu (do auto-ustawienia po logowaniu). */
export async function getOwnLanguage(
  userId: string,
): Promise<'pl' | 'en' | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('language')
    .eq('id', userId)
    .maybeSingle<{ language: string | null }>();
  if (error) return null;
  const value = data?.language;
  return value === 'pl' || value === 'en' ? value : null;
}

export async function saveExpoPushToken(
  token: string | null,
): Promise<{ error: { message: string } | null }> {
  const platform = Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web'
    ? Platform.OS
    : 'unknown';
  const { error } = await supabase.rpc('save_push_token', {
    p_token: token ?? '',
    p_platform: platform,
  });
  return { error };
}

export async function removePushToken(
  token: string,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase.rpc('remove_push_token', { p_token: token });
  return { error };
}

export async function hasExpoPushToken(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('expo_push_token')
    .eq('id', userId)
    .maybeSingle<{ expo_push_token: string | null }>();

  if (error) return false;
  return Boolean(data?.expo_push_token?.trim());
}

export async function getProfileAdminFlag(
  userId: string,
): Promise<{ isAdmin: boolean; error: { message: string } | null }> {
  const { data, error } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle<{ is_admin: boolean }>();

  if (error) return { isAdmin: false, error };
  return { isAdmin: Boolean(data?.is_admin), error: null };
}

export async function getProfileRole(
  userId: string,
): Promise<{ role: AppRole; error: { message: string } | null }> {
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle<{ role: AppRole }>();

  if (error) return { role: 'user', error };
  return { role: data?.role ?? 'user', error: null };
}
