import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ensureLocationPermission } from '@/lib/location-permission';

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
   * Ponawia sprawdzenie uprawnień/pobranie pozycji na żądanie (np. przycisk
   * "W pobliżu" albo "Włącz lokalizację" w Ustawieniach). Zwraca finalny
   * status, żeby wołający mógł pokazać feedback (np. toast), gdy nic się
   * wizualnie nie zmieni — przeglądarka po realnej odmowie nie pokaże już
   * własnego promptu, więc bez tego klik wyglądał jak "nic nie robi".
   */
  requestLocation: () => Promise<LocationStatus>;
};

/**
 * Prosi o zgodę na lokalizację „w trakcie używania" i zwraca pozycję użytkownika.
 * Najpierw próbuje szybkiej, ostatnio znanej pozycji (żeby mapa od razu skoczyła w okolicę),
 * potem dokłada dokładniejszą, aktualną. Lokalizacja jest pobierana tylko na żądanie
 * (przy wejściu na mapę), nie w tle — zgodnie z założeniami prywatności.
 */
export function useUserLocation(): UserLocationState {
  const [state, setState] = useState<{ status: LocationStatus; coords: LngLat | null }>({
    status: 'loading',
    coords: null,
  });
  const requestSeqRef = useRef(0);

  const resolveLocation = useCallback(async (): Promise<LocationStatus> => {
    const seq = ++requestSeqRef.current;
    setState((prev) => ({ ...prev, status: 'loading' }));

    const permission = await ensureLocationPermission();
    if (seq !== requestSeqRef.current) return 'loading';

    if (permission !== 'granted') {
      setState({ status: 'denied', coords: null });
      return 'denied';
    }

    try {
      // Szybka, przybliżona pozycja (jeśli dostępna) — natychmiastowy skok mapy w okolicę.
      const lastKnown = await Location.getLastKnownPositionAsync();
      if (seq === requestSeqRef.current && lastKnown) {
        setState({
          status: 'granted',
          coords: [lastKnown.coords.longitude, lastKnown.coords.latitude],
        });
      }

      // Dokładniejsza, aktualna pozycja.
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
  }, []);

  useEffect(() => {
    void resolveLocation();
  }, [resolveLocation]);

  const requestLocation = useCallback(() => resolveLocation(), [resolveLocation]);

  return { ...state, requestLocation };
}
