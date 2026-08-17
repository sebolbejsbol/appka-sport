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
export async function ensureLocationPermission(): Promise<'granted' | 'denied'> {
  try {
    const current = await Location.getForegroundPermissionsAsync();
    if (current.status === 'granted') return 'granted';
    // canAskAgain === false: system/przeglądarka i tak nie pokaże już
    // promptu ponownie (trwałe odrzucenie) — nie ma sensu wywoływać request,
    // od razu przechodzimy do fallbacku "otwórz ustawienia".
    if (current.status === 'denied' && current.canAskAgain === false) return 'denied';
  } catch {
    // np. web bez wsparcia dla navigator.permissions.query — przechodzimy
    // od razu do request poniżej, który i tak wymusza realny prompt.
  }

  try {
    const requested = await Location.requestForegroundPermissionsAsync();
    return requested.status === 'granted' ? 'granted' : 'denied';
  } catch {
    // Safari (iOS i macOS) w ogóle nie wspiera navigator.permissions.query
    // dla 'geolocation' — rzuca TypeError, i to ZANIM expo-location zdąży w
    // środku wywołać prawdziwe navigator.geolocation.getCurrentPosition().
    // Efekt: na Safari powyższe dwie próby zawsze rzucają, więc przeglądarka
    // NIGDY nie pokazuje natywnego promptu — apka po prostu poddaje się i
    // pokazuje "brak dostępu", mimo że w ogóle nie zapytała. Bezpośrednie
    // wywołanie geolokalizacji (poniżej) omija ten zepsuty krok — to jedyna
    // metoda w tym shimie, która nie zależy od navigator.permissions.
    return probeBrowserGeolocation();
  }
}

function probeBrowserGeolocation(): Promise<'granted' | 'denied'> {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve('denied');
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve('granted'),
      () => resolve('denied'),
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
