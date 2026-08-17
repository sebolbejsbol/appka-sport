import * as Location from 'expo-location';
import { Platform } from 'react-native';

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

export type CheckInLocationStatus = 'ok' | 'permission_denied' | 'unavailable' | 'timeout';

export type CheckInLocationResult = {
  status: CheckInLocationStatus;
  coords: LngLat | null;
};

// Pojedyncze getCurrentPositionAsync({accuracy: High}) bez timeoutu i bez
// sprawdzania dokładności odczytu potrafiło "działać na jednym telefonie,
// a nie na innym" — słaby pierwszy fix GPS (typowy w budynkach / z zimną
// anteną) zwracał odczyt z dużą niepewnością, który i tak przechodził dalej,
// albo request wisiał bez końca na urządzeniach/przeglądarkach z wolnym GPS.
// Nowa wersja: kilka prób w budżecie czasowym, zatrzymuje najlepszy
// (najdokładniejszy) odczyt, z jawnym timeoutem na próbę i fallbackiem na
// niższą dokładność, jeśli High nigdy się nie uda.
const ATTEMPT_TIMEOUT_MS = 6000;
const TOTAL_BUDGET_MS = 9000;
const GOOD_ENOUGH_ACCURACY_M = 30;

function getPositionWithTimeout(
  accuracy: Location.Accuracy,
  timeoutMs: number,
): Promise<Location.LocationObject> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    Location.getCurrentPositionAsync({ accuracy })
      .then((position) => {
        clearTimeout(timer);
        resolve(position);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * WEB: expo-location deleguje do przeglądarkowego navigator.geolocation, ale
 * jego shim NAJPIERW sprawdza uprawnienia przez navigator.permissions.query —
 * którego Safari (iOS i macOS) w ogóle nie wspiera dla 'geolocation' i rzuca
 * TypeError ZANIM w ogóle dojdzie do prawdziwego navigator.geolocation.
 * getCurrentPosition(). Efekt: na Safari meldowanie nigdy realnie nie pytało
 * o zgodę — apka po prostu pokazywała własny tekst "włącz w ustawieniach",
 * mimo że przeglądarka nigdy nie została zapytana. Ta funkcja woła
 * navigator.geolocation BEZPOŚREDNIO, z pominięciem expo-location, żeby
 * realny systemowy/przeglądarkowy prompt faktycznie się pokazał.
 *
 * WAŻNE: musi być wywoływana możliwie blisko (najlepiej pierwsza rzecz w)
 * handlera kliknięcia „Melduj się" — bez zbędnych awaitów przed nią — Safari
 * na iOS bywa marudny co do promptów oderwanych od oryginalnego gestu usera.
 */
function checkWebGeolocationPermission(): Promise<'granted' | 'denied' | 'prompt'> {
  const permissions = (navigator as { permissions?: Permissions } | undefined)?.permissions;
  if (!permissions?.query) return Promise.resolve('prompt');
  return permissions
    .query({ name: 'geolocation' as PermissionName })
    .then((result) => result.state as 'granted' | 'denied' | 'prompt')
    .catch(() => 'prompt' as const);
}

function getWebCheckInCoords(): Promise<CheckInLocationResult> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({ status: 'unavailable', coords: null });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          status: 'ok',
          coords: [position.coords.longitude, position.coords.latitude],
        });
      },
      (error) => {
        // GeolocationPositionError: 1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE, 3=TIMEOUT.
        if (error.code === error.PERMISSION_DENIED) {
          resolve({ status: 'permission_denied', coords: null });
        } else if (error.code === error.TIMEOUT) {
          resolve({ status: 'timeout', coords: null });
        } else {
          resolve({ status: 'unavailable', coords: null });
        }
      },
      // Meldowanie sprawdza konkretną odległość do boiska — dokładność ma
      // znaczenie, stąd enableHighAccuracy zamiast domyślnej (siecowej) pozycji.
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  });
}

/** Pobiera świeżą pozycję GPS do meldowania, próbując uzyskać jak najlepszy odczyt. */
export async function getCheckInCoords(): Promise<CheckInLocationResult> {
  if (Platform.OS === 'web') {
    // Sam getCurrentPosition() już poprawnie odróżnia denied/unavailable/timeout
    // w swoim error callbacku (patrz wyżej) — ten pre-check tylko pozwala
    // pominąć zbędne wywołanie, gdy WIADOMO, że jest odmówione na stałe.
    const permission = await checkWebGeolocationPermission();
    if (permission === 'denied') {
      return { status: 'permission_denied', coords: null };
    }
    return getWebCheckInCoords();
  }

  const current = await Location.getForegroundPermissionsAsync();
  if (current.status !== 'granted') {
    const requested = await Location.requestForegroundPermissionsAsync();
    if (requested.status !== 'granted') return { status: 'permission_denied', coords: null };
  }

  const deadline = Date.now() + TOTAL_BUDGET_MS;
  let best: { coords: LngLat; accuracy: number } | null = null;

  while (Date.now() < deadline) {
    try {
      const position = await getPositionWithTimeout(Location.Accuracy.High, ATTEMPT_TIMEOUT_MS);
      const accuracy = position.coords.accuracy ?? Number.POSITIVE_INFINITY;
      const coords: LngLat = [position.coords.longitude, position.coords.latitude];
      if (!best || accuracy < best.accuracy) {
        best = { coords, accuracy };
      }
      if (accuracy <= GOOD_ENOUGH_ACCURACY_M) {
        return { status: 'ok', coords };
      }
    } catch {
      // Timeout albo błąd platformy na tej próbie — spróbuj ponownie, jeśli starcza budżetu.
    }
  }

  if (best) {
    return { status: 'ok', coords: best.coords };
  }

  // Ostatnia próba z niższą (szybszą, mniej dokładną) dokładnością jako fallback.
  try {
    const position = await getPositionWithTimeout(Location.Accuracy.Balanced, ATTEMPT_TIMEOUT_MS);
    return { status: 'ok', coords: [position.coords.longitude, position.coords.latitude] };
  } catch {
    return { status: 'unavailable', coords: null };
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
