import { router } from 'expo-router';
import * as Location from 'expo-location';
import { Linking, Platform } from 'react-native';

import { confirmAction } from '@/lib/confirm';
import { geoDiag } from '@/lib/geo-diag';
import { getCurrentLocation } from '@/lib/get-web-location';

export type LocationPermissionState = 'granted' | 'denied' | 'undetermined';

/**
 * Odczyt AKTUALNEGO stanu uprawnień — NIGDY nie pokazuje żadnego promptu.
 * Bezpieczne do wołania w tle / przy montowaniu ekranu (mapa, nawigacja,
 * event) — to jest to, co wcześniej apka robiła źle: montowanie mapy
 * aktywnie prosiło o zgodę, więc prompt wyskakiwał od razu przy starcie,
 * zanim user w ogóle zrobił cokolwiek, co lokalizacji wymaga.
 *
 * 'undetermined' oznacza zarówno "jeszcze nie pytano", jak i "nie da się
 * ustalić bez próby" (Safari — navigator.permissions nie wspiera
 * 'geolocation') — w obu przypadkach wolno jeszcze spróbować aktywnego
 * requestLocationPermission().
 */
export async function checkLocationPermission(): Promise<LocationPermissionState> {
  try {
    const current = await Location.getForegroundPermissionsAsync();
    geoDiag('checkLocationPermission: getForegroundPermissionsAsync ->', {
      status: current.status,
      canAskAgain: current.canAskAgain,
    });
    if (current.status === 'granted') return 'granted';
    if (current.status === 'denied' && current.canAskAgain === false) return 'denied';
    return 'undetermined';
  } catch (err) {
    // Na Safari expo-location rzuca tu ZAWSZE (navigator.permissions.query
    // nie wspiera 'geolocation') — to jest OCZEKIWANE i celowo łapane, nie
    // "cichy błąd": stąd 'undetermined', nie realny stan uprawnień.
    geoDiag('checkLocationPermission: getForegroundPermissionsAsync threw (expected on Safari)', {
      message: String(err),
    });
    return 'undetermined';
  }
}

/**
 * AKTYWNIE prosi o zgodę — pokazuje natywny systemowy prompt ("Zezwól
 * podczas używania" / "Nie zezwalaj"), jeśli status jest 'undetermined'.
 * Wołać WYŁĄCZNIE z bezpośredniej akcji użytkownika (Dołącz do eventu,
 * Stwórz event) — patrz requireLocationPermission poniżej, które właśnie
 * to egzekwuje w jednym miejscu.
 */
export async function requestLocationPermission(): Promise<'granted' | 'denied'> {
  try {
    const requested = await Location.requestForegroundPermissionsAsync();
    geoDiag('requestLocationPermission: requestForegroundPermissionsAsync ->', {
      status: requested.status,
    });
    return requested.status === 'granted' ? 'granted' : 'denied';
  } catch (err) {
    // Safari (iOS i macOS) w ogóle nie wspiera navigator.permissions.query
    // dla 'geolocation' — rzuca TypeError, i to ZANIM expo-location zdąży w
    // środku wywołać prawdziwe navigator.geolocation.getCurrentPosition().
    // get-web-location.ts woła geolokalizację bezpośrednio, z pominięciem
    // tego zepsutego kroku — to samo miejsce, którego używa KAŻDA inna
    // akcja lokalizacyjna na webie (meldowanie, nawigacja, eventy w
    // pobliżu, tworzenie eventu), więc to jest jedyna kopia tej logiki.
    geoDiag('requestLocationPermission: requestForegroundPermissionsAsync threw (expected on Safari), falling back to getCurrentLocation', {
      message: String(err),
    });
    const result = await getCurrentLocation();
    geoDiag('requestLocationPermission: fallback getCurrentLocation ->', result);
    return result.ok ? 'granted' : 'denied';
  }
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

/**
 * JEDYNE miejsce w apce, które wolno wołać z akcji "Dołącz do eventu" /
 * "Stwórz event" — pełny flow zgodności z natywnym zachowaniem platformy:
 *
 *  - granted        -> true od razu, żadnego promptu.
 *  - undetermined    -> pokazuje natywny systemowy prompt; jeśli user zezwoli,
 *                       true od razu (bez dodatkowego klikania w apce).
 *  - denied/restricted (już teraz, albo user właśnie odmówił w prompcie)
 *                    -> krótki modal tłumaczący PO CO w tym kontekście jest
 *                       lokalizacja, z przyciskiem, który przenosi do
 *                       ustawień (systemowych na natywnej appce, do
 *                       ekranu Ustawień w apce na webie). Cancel po prostu
 *                       zamyka modal — nie blokuje reszty apki, blokuje
 *                       tylko tę jedną akcję.
 */
export async function requireLocationPermission(opts: {
  title: string;
  message: string;
  settingsLabel: string;
  cancelLabel: string;
}): Promise<boolean> {
  geoDiag('requireLocationPermission: start (Dołącz/Stwórz event)', {});
  let state = await checkLocationPermission();
  geoDiag('requireLocationPermission: checkLocationPermission ->', { state });

  if (state === 'undetermined') {
    state = await requestLocationPermission();
    geoDiag('requireLocationPermission: requestLocationPermission ->', { state });
  }

  if (state === 'granted') {
    geoDiag('requireLocationPermission: granted, proceeding', {});
    return true;
  }

  geoDiag('requireLocationPermission: not granted, showing settings modal', { state });
  confirmAction(opts.title, opts.message, opts.settingsLabel, opts.cancelLabel, () => {
    if (canOpenLocationSettings) void openLocationSettings();
    else router.push('/settings');
  });
  return false;
}
