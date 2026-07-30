import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

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
};

/**
 * Prosi o zgodę na lokalizację „w trakcie używania" i zwraca pozycję użytkownika.
 * Najpierw próbuje szybkiej, ostatnio znanej pozycji (żeby mapa od razu skoczyła w okolicę),
 * potem dokłada dokładniejszą, aktualną. Lokalizacja jest pobierana tylko na żądanie
 * (przy wejściu na mapę), nie w tle — zgodnie z założeniami prywatności.
 */
export function useUserLocation(): UserLocationState {
  const [state, setState] = useState<UserLocationState>({
    status: 'loading',
    coords: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function resolveLocation() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;

        if (status !== 'granted') {
          setState({ status: 'denied', coords: null });
          return;
        }

        // Szybka, przybliżona pozycja (jeśli dostępna) — natychmiastowy skok mapy w okolicę.
        const lastKnown = await Location.getLastKnownPositionAsync();
        if (!cancelled && lastKnown) {
          setState({
            status: 'granted',
            coords: [lastKnown.coords.longitude, lastKnown.coords.latitude],
          });
        }

        // Dokładniejsza, aktualna pozycja.
        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!cancelled) {
          setState({
            status: 'granted',
            coords: [current.coords.longitude, current.coords.latitude],
          });
        }
      } catch {
        if (!cancelled) {
          setState((prev) =>
            prev.coords ? prev : { status: 'unavailable', coords: null },
          );
        }
      }
    }

    resolveLocation();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
