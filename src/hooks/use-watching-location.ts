import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';

import { checkLocationPermission } from '@/lib/location-permission';
import type { LocationStatus, LngLat } from '@/hooks/use-user-location';

export type UserLocationState = {
  status: LocationStatus;
  coords: LngLat | null;
  /** Ponawia PASYWNE sprawdzenie uprawnień (bez promptu) i śledzenie, jeśli już przyznane. */
  requestLocation: () => Promise<LocationStatus>;
};

/**
 * Ciągłe śledzenie lokalizacji (np. dystans do boiska na ekranie eventu,
 * nawigacja). PASYWNE — nigdy nie pokazuje natywnego promptu o zgodę samym
 * montowaniem; jeśli zgoda jest już przyznana, zaczyna śledzić, jeśli nie,
 * zostawia status 'denied'/'loading' bez pytania. Aktywny prompt istnieje
 * tylko w requireLocationPermission() z location-permission.ts, wołanym
 * wprost z "Dołącz do eventu" / "Stwórz event".
 */
export function useWatchingLocation(enabled = true): UserLocationState {
  const [state, setState] = useState<{ status: LocationStatus; coords: LngLat | null }>({
    status: 'loading',
    coords: null,
  });
  const requestSeqRef = useRef(0);
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);

  const startWatching = useCallback(async (): Promise<LocationStatus> => {
    const seq = ++requestSeqRef.current;
    subscriptionRef.current?.remove();
    subscriptionRef.current = null;
    setState((prev) => ({ ...prev, status: 'loading' }));

    const permission = await checkLocationPermission();
    if (seq !== requestSeqRef.current) return 'loading';

    if (permission !== 'granted') {
      setState({ status: 'denied', coords: null });
      return 'denied';
    }

    try {
      const lastKnown = await Location.getLastKnownPositionAsync();
      if (seq !== requestSeqRef.current) return 'loading';

      if (lastKnown) {
        setState({
          status: 'granted',
          coords: [lastKnown.coords.longitude, lastKnown.coords.latitude],
        });
      }

      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 5,
          timeInterval: 3000,
        },
        (position) => {
          if (seq !== requestSeqRef.current) return;
          setState({
            status: 'granted',
            coords: [position.coords.longitude, position.coords.latitude],
          });
        },
      );

      if (seq !== requestSeqRef.current) {
        subscription.remove();
        return 'loading';
      }
      subscriptionRef.current = subscription;
      return 'granted';
    } catch {
      if (seq === requestSeqRef.current) {
        setState((prev) => (prev.coords ? prev : { status: 'unavailable', coords: null }));
      }
      return 'unavailable';
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void startWatching();
    return () => {
      requestSeqRef.current += 1;
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
    };
  }, [enabled, startWatching]);

  const requestLocation = useCallback(() => {
    if (!enabled) return Promise.resolve<LocationStatus>('denied');
    return startWatching();
  }, [enabled, startWatching]);

  return { ...state, requestLocation };
}

export type { LocationStatus, LngLat };
