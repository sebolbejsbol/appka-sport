import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import type { LocationStatus, LngLat, UserLocationState } from '@/hooks/use-user-location';

/**
 * Ciągłe śledzenie lokalizacji (np. w drodze na event).
 * Odświeża pozycję co kilka sekund lub po przesunięciu ~5 m.
 */
export function useWatchingLocation(enabled = true): UserLocationState {
  const [state, setState] = useState<UserLocationState>({
    status: 'loading',
    coords: null,
  });

  useEffect(() => {
    if (!enabled) return;

    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    async function startWatching() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;

        if (status !== 'granted') {
          setState({ status: 'denied', coords: null });
          return;
        }

        const lastKnown = await Location.getLastKnownPositionAsync();
        if (cancelled) return;

        if (lastKnown) {
          setState({
            status: 'granted',
            coords: [lastKnown.coords.longitude, lastKnown.coords.latitude],
          });
        }

        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 5,
            timeInterval: 3000,
          },
          (position) => {
            if (cancelled) return;
            setState({
              status: 'granted',
              coords: [position.coords.longitude, position.coords.latitude],
            });
          },
        );

        if (cancelled) {
          subscription.remove();
          subscription = null;
        }
      } catch {
        if (!cancelled) {
          setState((prev) =>
            prev.coords ? prev : { status: 'unavailable', coords: null },
          );
        }
      }
    }

    void startWatching();

    return () => {
      cancelled = true;
      subscription?.remove();
      subscription = null;
    };
  }, [enabled]);

  return state;
}

export type { LocationStatus, LngLat, UserLocationState };
