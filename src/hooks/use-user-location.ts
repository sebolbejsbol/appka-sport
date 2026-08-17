import * as Location from 'expo-location';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { geoDiag } from '@/lib/geo-diag';
import { checkBrowserPermission } from '@/lib/get-web-location';
import { checkLocationPermission, requestLocationPermission } from '@/lib/location-permission';

/**
 * Stan pobierania lokalizacji użytkownika:
 * - loading  — czekamy na zgodę / pozycję
 * - granted  — mamy zgodę i (zwykle) współrzędne
 * - denied   — użytkownik odmówił dostępu do lokalizacji
 * - unavailable — nie udało się pobrać pozycji (np. GPS wyłączony, błąd)
 * - timeout — ustalanie pozycji trwało zbyt długo (web: patrz get-web-location.ts)
 */
export type LocationStatus = 'loading' | 'granted' | 'denied' | 'unavailable' | 'timeout';

/** Współrzędne w formacie Mapbox: [długość geograficzna, szerokość geograficzna]. */
export type LngLat = [number, number];

export type UserLocationState = {
  status: LocationStatus;
  coords: LngLat | null;
  /**
   * AKTYWNIE prosi o zgodę (może pokazać natywny prompt) i zwraca finalny
   * status. Wołać TYLKO z bezpośredniej akcji usera — np. przycisku
   * "Włącz lokalizację" w Ustawieniach. Nigdy automatycznie w tle: mapa i
   * inne ekrany montujące ten hook dostają tylko PASYWNY odczyt aktualnego
   * stanu (patrz efekt niżej) — to naprawia wcześniejszy błąd, gdzie sam
   * wejście na mapę wyskakiwało z systemowym promptem o lokalizację.
   */
  requestLocation: () => Promise<LocationStatus>;
};

/**
 * Odczytuje stan lokalizacji użytkownika PASYWNIE (nigdy nie pokazuje
 * promptu przy montowaniu) — jeśli zgoda jest już przyznana, dociąga
 * pozycję; jeśli nie, zostawia status 'denied'/'loading' bez pytania.
 * Aktywne proszenie o zgodę (z natywnym promptem) robi tylko
 * requestLocationPermission() z location-permission.ts, wołane wprost z
 * "Dołącz do eventu" / "Stwórz event" (patrz tam) albo z przycisku w
 * Ustawieniach (przez requestLocation() zwrócone z tego hooka).
 *
 * TYMCZASOWA diagnostyka (2026-08-17, patrz geo-diag.ts): loguje mount,
 * każdą zmianę stanu i KAŻDY przypadek, gdy sekwencyjny numer żądania nie
 * zgadza się (co oznaczałoby, że komponent zamontował się ponownie / inne
 * żądanie wystartowało w międzyczasie i unieważniło wynik tego).
 */
export function useUserLocation(): UserLocationState {
  const [state, setState] = useState<{ status: LocationStatus; coords: LngLat | null }>({
    status: 'loading',
    coords: null,
  });
  const requestSeqRef = useRef(0);
  const instanceIdRef = useRef<string>(useId());

  useEffect(() => {
    const id = instanceIdRef.current;
    geoDiag('useUserLocation MOUNTED', { instance: id });
    return () => geoDiag('useUserLocation UNMOUNTED', { instance: id });
  }, []);

  const fetchCoords = useCallback(
    async (seq: number): Promise<LocationStatus> => {
      try {
        const lastKnown = await Location.getLastKnownPositionAsync();
        if (seq !== requestSeqRef.current) {
          geoDiag('useUserLocation fetchCoords: seq stale after getLastKnownPositionAsync', {
            instance: instanceIdRef.current,
            seq,
            current: requestSeqRef.current,
          });
        } else if (lastKnown) {
          geoDiag('useUserLocation fetchCoords: lastKnown', {
            instance: instanceIdRef.current,
            lat: lastKnown.coords.latitude,
            lng: lastKnown.coords.longitude,
          });
          setState({
            status: 'granted',
            coords: [lastKnown.coords.longitude, lastKnown.coords.latitude],
          });
        }

        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (seq !== requestSeqRef.current) {
          geoDiag('useUserLocation fetchCoords: seq stale after getCurrentPositionAsync — DROPPING RESULT', {
            instance: instanceIdRef.current,
            seq,
            current: requestSeqRef.current,
            lat: current.coords.latitude,
            lng: current.coords.longitude,
          });
          return 'loading';
        }
        geoDiag('useUserLocation fetchCoords: current position -> setState granted', {
          instance: instanceIdRef.current,
          lat: current.coords.latitude,
          lng: current.coords.longitude,
        });
        setState({
          status: 'granted',
          coords: [current.coords.longitude, current.coords.latitude],
        });
        return 'granted';
      } catch (err) {
        geoDiag('useUserLocation fetchCoords: threw', {
          instance: instanceIdRef.current,
          message: String(err),
        });
        if (seq === requestSeqRef.current) {
          setState((prev) => (prev.coords ? prev : { status: 'unavailable', coords: null }));
        }
        return 'unavailable';
      }
    },
    [],
  );

  /**
   * WEB: checkLocationPermission() (expo-location) rzuca ZAWSZE na Safari
   * (navigator.permissions.query nie wspiera 'geolocation'), co dawniej
   * kończyło się bezwarunkowym 'denied' — NIEZALEŻNIE od tego, czy user
   * faktycznie zezwolił. Efekt: mapa na Safari na stałe pokazywała "włącz
   * lokalizację", nawet po realnym Allow i odświeżeniu. Naprawa: pytamy
   * bezpośrednio checkBrowserPermission() (get-web-location.ts), które
   * odróżnia 'prompt' (Chrome i inne szczerze mówią "jeszcze nie pytano" —
   * zostajemy bierni, zero promptu, tak jak w redesignie "prompt tylko przy
   * Join/Create") od 'unsupported' (Safari nie umie tego stwierdzić bez
   * próby — więc próbujemy: jeśli realnie granted, przechodzi po cichu bez
   * żadnego promptu; jedyny przypadek gdy pokaże prompt to naprawdę
   * pierwsza wizyta na Safari, czego nie da się uniknąć bez tej informacji).
   */
  const checkOnlyWeb = useCallback(
    async (seq: number) => {
      const permission = await checkBrowserPermission();
      geoDiag('useUserLocation checkOnly (web): checkBrowserPermission ->', {
        instance: instanceIdRef.current,
        seq,
        permission,
      });
      if (seq !== requestSeqRef.current) return;

      if (permission === 'denied') {
        setState({ status: 'denied', coords: null });
        return;
      }
      if (permission === 'prompt') {
        // Szczerze "jeszcze nie pytano" — zostajemy bierni, żeby uniknąć
        // eager promptu przy samym wejściu na mapę.
        setState({ status: 'denied', coords: null });
        return;
      }

      // 'granted' albo 'unsupported' (Safari) — spróbuj pobrać pozycję.
      await fetchCoords(seq);
    },
    [fetchCoords],
  );

  const checkOnly = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    geoDiag('useUserLocation checkOnly: start', { instance: instanceIdRef.current, seq });
    setState((prev) => ({ ...prev, status: 'loading' }));

    if (Platform.OS === 'web') {
      await checkOnlyWeb(seq);
      return;
    }

    const permission = await checkLocationPermission();
    geoDiag('useUserLocation checkOnly: checkLocationPermission ->', {
      instance: instanceIdRef.current,
      seq,
      permission,
    });
    if (seq !== requestSeqRef.current) {
      geoDiag('useUserLocation checkOnly: seq stale, aborting', { instance: instanceIdRef.current, seq });
      return;
    }

    if (permission !== 'granted') {
      setState({ status: 'denied', coords: null });
      return;
    }

    await fetchCoords(seq);
  }, [fetchCoords, checkOnlyWeb]);

  useEffect(() => {
    void checkOnly();
  }, [checkOnly]);

  const requestLocation = useCallback(async (): Promise<LocationStatus> => {
    const seq = ++requestSeqRef.current;
    geoDiag('useUserLocation requestLocation: start', { instance: instanceIdRef.current, seq });
    setState((prev) => ({ ...prev, status: 'loading' }));

    const permission = await requestLocationPermission();
    geoDiag('useUserLocation requestLocation: requestLocationPermission ->', {
      instance: instanceIdRef.current,
      seq,
      permission,
    });
    if (seq !== requestSeqRef.current) {
      geoDiag('useUserLocation requestLocation: seq stale after permission, aborting', {
        instance: instanceIdRef.current,
        seq,
        current: requestSeqRef.current,
      });
      return 'loading';
    }

    if (permission !== 'granted') {
      setState({ status: 'denied', coords: null });
      return 'denied';
    }

    return fetchCoords(seq);
  }, [fetchCoords]);

  return { ...state, requestLocation };
}
