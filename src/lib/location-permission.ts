import * as Location from 'expo-location';
import { Linking, Platform } from 'react-native';

/**
 * Wspólna logika uprawnień do lokalizacji — jedno miejsce dla mapy
 * (use-user-location, use-watching-location) i nawigacji do boiska
 * (field-navigation). Wcześniej każde miejsce robiło własny
 * requestForegroundPermissionsAsync() bez sprawdzenia aktualnego stanu,
 * więc żadne z nich nie potrafiło odróżnić "jeszcze nie pytaliśmy" od
 * "user już odmówił" i pokazać właściwej podpowiedzi.
 */
/**
 * Diagnostyka ostatniej próby — pokazywana userowi w hincie "brak dostępu",
 * żeby dało się odróżnić "system nigdy nie zapytał" / "user odmówił" /
 * "usługi lokalizacji wyłączone" bez dostępu do konsoli przeglądarki na
 * telefonie. Ustawiana przy KAŻDEJ próbie, także udanej (wtedy null).
 */
let lastDebugInfo: string | null = null;
export function getLastLocationDebugInfo(): string | null {
  return lastDebugInfo;
}

export async function ensureLocationPermission(): Promise<'granted' | 'denied'> {
  try {
    const current = await Location.getForegroundPermissionsAsync();
    if (current.status === 'granted') {
      lastDebugInfo = null;
      return 'granted';
    }
    // canAskAgain === false: system/przeglądarka i tak nie pokaże już
    // promptu ponownie (trwałe odrzucenie) — nie ma sensu wywoływać request,
    // od razu przechodzimy do fallbacku "otwórz ustawienia".
    if (current.status === 'denied' && current.canAskAgain === false) {
      lastDebugInfo = `getForegroundPermissionsAsync: status=${current.status} canAskAgain=false`;
      return 'denied';
    }
  } catch (err) {
    // np. web bez wsparcia dla navigator.permissions.query — przechodzimy
    // od razu do request poniżej, który i tak wymusza realny prompt.
    lastDebugInfo = `getForegroundPermissionsAsync threw: ${describeError(err)}`;
  }

  try {
    const requested = await Location.requestForegroundPermissionsAsync();
    if (requested.status === 'granted') {
      lastDebugInfo = null;
      return 'granted';
    }
    lastDebugInfo = `requestForegroundPermissionsAsync: status=${requested.status} canAskAgain=${requested.canAskAgain}`;
    return 'denied';
  } catch (err) {
    // Safari (iOS i macOS) w ogóle nie wspiera navigator.permissions.query
    // dla 'geolocation' — rzuca TypeError, i to ZANIM expo-location zdąży w
    // środku wywołać prawdziwe navigator.geolocation.getCurrentPosition().
    // Efekt: na Safari powyższe dwie próby zawsze rzucają, więc przeglądarka
    // NIGDY nie pokazuje natywnego promptu — apka po prostu poddaje się i
    // pokazuje "brak dostępu", mimo że w ogóle nie zapytała. Bezpośrednie
    // wywołanie geolokalizacji (poniżej) omija ten zepsuty krok — to jedyna
    // metoda w tym shimie, która nie zależy od navigator.permissions.
    lastDebugInfo = `requestForegroundPermissionsAsync threw: ${describeError(err)}; probing navigator.geolocation directly`;
    return probeBrowserGeolocation();
  }
}

function describeError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

function probeBrowserGeolocation(): Promise<'granted' | 'denied'> {
  if (Platform.OS !== 'web') {
    lastDebugInfo = 'probe skipped: not web platform';
    return Promise.resolve('denied');
  }
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    lastDebugInfo = 'probe skipped: navigator.geolocation unavailable';
    return Promise.resolve('denied');
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => {
        lastDebugInfo = null;
        resolve('granted');
      },
      (err) => {
        // GeolocationPositionError codes: 1=PERMISSION_DENIED,
        // 2=POSITION_UNAVAILABLE, 3=TIMEOUT.
        lastDebugInfo = `navigator.geolocation error: code=${err.code} message=${err.message}`;
        resolve('denied');
      },
      { maximumAge: 60000 },
    );
  });
}

/** Otwiera systemowe ustawienia uprawnień apki. Na webie nie ma takiego API. */
export async function openLocationSettings(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    await Linking.openSettings();
    return true;
  } catch {
    return false;
  }
}

export const canOpenLocationSettings = Platform.OS !== 'web';
