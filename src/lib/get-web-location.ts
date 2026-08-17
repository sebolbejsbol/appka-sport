import * as Location from 'expo-location';
import { Platform } from 'react-native';

import type { LngLat } from '@/hooks/use-user-location';
import { geoDiag } from '@/lib/geo-diag';

export type LocationErrorCode = 'PERMISSION_DENIED' | 'POSITION_UNAVAILABLE' | 'TIMEOUT';

export type LocationFetchResult =
  | { ok: true; coords: LngLat }
  | { ok: false; error: LocationErrorCode };

/**
 * iOS Safari nie wspiera navigator.permissions.query('geolocation') i inne
 * ścieżki odblokowania różnią się od Androida/Chrome — potrzebne do
 * dobrania właściwej instrukcji "jak odblokować" (patrz
 * getPermissionInstructionsKey niżej).
 */
export function isIOSWebBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // iPadOS 13+ przedstawia się jako "Macintosh" (desktop Safari), ale ma
  // ekran dotykowy — prawdziwy Mac nie ma maxTouchPoints > 0.
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

const GEOLOCATION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 0,
} as const;

/**
 * JEDYNE miejsce w apce, które woła przeglądarkowe Geolocation API — reużywane
 * przez KAŻDĄ akcję wymagającą lokalizacji na webie (meldowanie, nawigacja do
 * boiska, eventy w pobliżu, tworzenie eventu). Poza webem (iOS/Android)
 * przekazuje obsługę do istniejącego natywnego flow expo-location, bez zmiany
 * jego zachowania.
 *
 * WAŻNE (web): wołać BEZPOŚREDNIO w handlerze kliknięcia usera — bez
 * zbędnych awaitów/opóźnień przed nią. Safari na iOS potrafi zignorować
 * wywołanie geolokalizacji oderwane od oryginalnego gestu i nie pokazać
 * natywnego promptu.
 */
export async function getCurrentLocation(): Promise<LocationFetchResult> {
  geoDiag('getCurrentLocation() called', { platform: Platform.OS });
  try {
    const result = Platform.OS !== 'web' ? await getNativeLocation() : await getBrowserLocation();
    geoDiag('getCurrentLocation() returning', result);
    return result;
  } catch (err) {
    // Nic w tej ścieżce nie powinno rzucać (obie gałęzie mają własne
    // try/catch) — jeśli to loguje, to znaczy że COŚ NIEOCZEKIWANEGO rzuca
    // wyjątek, który wcześniej byłby cicho połknięty przez wołającego.
    geoDiag('getCurrentLocation() UNEXPECTED THROW', { message: String(err) });
    return { ok: false, error: 'POSITION_UNAVAILABLE' };
  }
}

async function getNativeLocation(): Promise<LocationFetchResult> {
  try {
    let { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      const requested = await Location.requestForegroundPermissionsAsync();
      status = requested.status;
    }
    if (status !== 'granted') return { ok: false, error: 'PERMISSION_DENIED' };

    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { ok: true, coords: [position.coords.longitude, position.coords.latitude] };
  } catch {
    return { ok: false, error: 'POSITION_UNAVAILABLE' };
  }
}

/**
 * 'unsupported' odróżnia "przeglądarka NIE UMIE powiedzieć jaki jest stan"
 * (Safari — navigator.permissions.query nie wspiera 'geolocation', zawsze
 * rzuca) od 'prompt' — "przeglądarka SZCZERZE mówi, że jeszcze nie pytano"
 * (Chrome/inne). To rozróżnienie jest kluczowe dla wołających, którzy NIE
 * chcą ryzykować promptu przy biernym sprawdzeniu (np. samo wejście na
 * mapę) — dla 'prompt' zostają bierni, dla 'unsupported' muszą i tak
 * spróbować, bo inaczej nigdy nie wykryją realnie przyznanej zgody na
 * Safari (patrz use-user-location.ts).
 */
export type BrowserPermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';

/**
 * Sam getCurrentPosition() poniżej i tak poprawnie odróżnia denied/
 * unavailable/timeout w swoim error callbacku — ten pre-check tylko pozwala
 * pominąć zbędne wywołanie, gdy WIADOMO, że jest odmówione na stałe.
 */
export function checkBrowserPermission(): Promise<BrowserPermissionState> {
  const permissions = (navigator as { permissions?: Permissions } | undefined)?.permissions;
  if (!permissions?.query) {
    geoDiag('permissions.query unsupported', {});
    return Promise.resolve('unsupported');
  }
  return permissions
    .query({ name: 'geolocation' as PermissionName })
    .then((result) => {
      geoDiag('permissions.query result', { state: result.state });
      return result.state as 'granted' | 'denied' | 'prompt';
    })
    .catch((err) => {
      geoDiag('permissions.query threw', { message: String(err) });
      return 'unsupported' as const;
    });
}

function getBrowserLocation(): Promise<LocationFetchResult> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    geoDiag('navigator.geolocation missing', {});
    return Promise.resolve({ ok: false, error: 'POSITION_UNAVAILABLE' });
  }

  return checkBrowserPermission().then((permission) => {
    if (permission === 'denied') {
      geoDiag('skipping getCurrentPosition: permission denied', {});
      return { ok: false, error: 'PERMISSION_DENIED' };
    }

    return new Promise<LocationFetchResult>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          geoDiag('getCurrentPosition success', {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
          });
          resolve({ ok: true, coords: [position.coords.longitude, position.coords.latitude] });
        },
        (error) => {
          // GeolocationPositionError: 1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE, 3=TIMEOUT.
          geoDiag('getCurrentPosition error', {
            code: error.code,
            message: error.message,
          });
          if (error.code === error.PERMISSION_DENIED) {
            resolve({ ok: false, error: 'PERMISSION_DENIED' });
          } else if (error.code === error.TIMEOUT) {
            resolve({ ok: false, error: 'TIMEOUT' });
          } else {
            resolve({ ok: false, error: 'POSITION_UNAVAILABLE' });
          }
        },
        GEOLOCATION_OPTIONS,
      );
    });
  });
}
