import * as Location from 'expo-location';

import type { LngLat } from '@/hooks/use-user-location';
import { supabase } from '@/lib/supabase';

export const CHECK_IN_RADIUS_M = 100;

export type CheckInWindow = 'not_yet' | 'open' | 'closed';

export type MyCheckIn = {
  checked_in_at: string;
  method: 'gps' | 'manual';
  is_late: boolean;
};

export type CheckInResult =
  | 'checked_in'
  | 'already_checked_in'
  | 'not_participant'
  | 'not_in_window'
  | 'window_closed'
  | 'window_still_open'
  | 'too_far'
  | 'event_not_found'
  | 'event_closed'
  | 'not_organizer'
  | 'not_authenticated'
  | 'no_location'
  | 'error';

/** Pobiera świeżą pozycję GPS do meldowania (wysoka dokładność). */
export async function getCheckInCoords(): Promise<LngLat | null> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.status !== 'granted') {
    const requested = await Location.requestForegroundPermissionsAsync();
    if (requested.status !== 'granted') return null;
  }

  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    return [position.coords.longitude, position.coords.latitude];
  } catch {
    return null;
  }
}

export async function checkInEvent(
  eventId: string,
  coords: LngLat,
): Promise<CheckInResult> {
  const [lng, lat] = coords;
  const { data, error } = await supabase.rpc('check_in_event', {
    p_event_id: eventId,
    p_lng: lng,
    p_lat: lat,
  });

  if (error) return 'error';
  return (data as CheckInResult | null) ?? 'error';
}

export async function manualCheckInEvent(
  eventId: string,
  userId: string,
): Promise<CheckInResult> {
  const { data, error } = await supabase.rpc('manual_check_in_event', {
    p_event_id: eventId,
    p_user_id: userId,
  });

  if (error) return 'error';
  return (data as CheckInResult | null) ?? 'error';
}

/** Komunikat błędu meldowania po polsku. */
export function checkInErrorMessage(result: CheckInResult): string {
  switch (result) {
    case 'too_far':
      return 'Jesteś za daleko od boiska.';
    case 'not_in_window':
      return 'Okno meldowania jeszcze się nie otworzyło.';
    case 'window_closed':
      return 'Okno meldowania już się zamknęło.';
    case 'not_participant':
      return 'Nie jesteś uczestnikiem tego eventu.';
    case 'event_closed':
      return 'Event jest zakończony lub anulowany.';
    case 'no_location':
      return 'Brak dostępu do lokalizacji.';
    default:
      return 'Nie udało się zameldować. Spróbuj ponownie.';
  }
}
