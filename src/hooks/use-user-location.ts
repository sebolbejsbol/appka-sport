import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';

import { checkLocationPermission, requestLocationPermission } from '@/lib/location-permission';

/**
 * Stan pobierania lokalizacji użytkownika:
 * - loading  — czekamy na zgodę / pozycję
 * - granted  — mamy zgodę i (zwykle) współrzędne
 * - denied   — użytkownik odmówił dostępu do lokalizacji
 * - unavailable — nie udało się pobrać pozycji (np. GPS wyłączony, błąd)
 */
export type LocationStatus = 'loading' | 'granted' | 'denied' | 'unavailable';

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
 */
export function useUserLocation(): UserLocationState {
  const [state, setState] = useState<{ status: LocationStatus; coords: LngLat | null }>({
    status: 'loading',
    coords: null,
  });
  const requestSeqRef = useRef(0);

  const fetchCoords = useCallback(
    async (seq: number): Promise<LocationStatus> => {
      try {
        const lastKnown = await Location.getLastKnownPositionAsync();
        if (seq === requestSeqRef.current && lastKnown) {
          setState({
            status: 'granted',
            coords: [lastKnown.coords.longitude, lastKnown.coords.latitude],
          });
        }

        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (seq === requestSeqRef.current) {
          setState({
            status: 'granted',
            coords: [current.coords.longitude, current.coords.latitude],
          });
        }
        return 'granted';
      } catch {
        if (seq === requestSeqRef.current) {
          setState((prev) => (prev.coords ? prev : { status: 'unavailable', coords: null }));
        }
        return 'unavailable';
      }
    },
    [],
  );

  const checkOnly = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    setState((prev) => ({ ...prev, status: 'loading' }));

    const permission = await checkLocationPermission();
    if (seq !== requestSeqRef.current) return;

    if (permission !== 'granted') {
      setState({ status: 'denied', coords: null });
      return;
    }

    await fetchCoords(seq);
  }, [fetchCoords]);

  useEffect(() => {
    void checkOnly();
  }, [checkOnly]);

  const requestLocation = useCallback(async (): Promise<LocationStatus> => {
    const seq = ++requestSeqRef.current;
    setState((prev) => ({ ...prev, status: 'loading' }));

    const permission = await requestLocationPermission();
    if (seq !== requestSeqRef.current) return 'loading';

    if (permission !== 'granted') {
      setState({ status: 'denied', coords: null });
      return 'denied';
    }

    return fetchCoords(seq);
  }, [fetchCoords]);

  return { ...state, requestLocation };
}
