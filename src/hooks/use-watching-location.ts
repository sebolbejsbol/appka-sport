import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { getCurrentLocation } from '@/lib/get-web-location';
import { checkLocationPermission } from '@/lib/location-permission';
import type { LocationStatus, LngLat } from '@/hooks/use-user-location';

export type UserLocationState = {
  status: LocationStatus;
  coords: LngLat | null;
  /** Ponawia sprawdzenie/śledzenie lokalizacji. Na webie realnie ponawia próbę pobrania pozycji. */
  requestLocation: () => Promise<LocationStatus>;
};

/**
 * Ciągłe śledzenie lokalizacji (np. dystans do boiska na ekranie eventu,
 * nawigacja).
 *
 * WEB: NIE gejtujemy startu śledzenia za pasywnym checkLocationPermission() —
 * ten polega na navigator.permissions.query('geolocation'), którego Safari
 * (iOS i macOS) w ogóle nie wspiera i zawsze rzuca. Efekt zanim to
 * naprawiono: na Safari ten hook NIGDY nie wykrywał "granted", nawet gdy
 * user faktycznie zezwolił w ustawieniach — apka wyglądała na trwale
 * zepsutą mimo przyznanej zgody. Zamiast tego wołamy getCurrentLocation()
 * (get-web-location.ts), które zawsze próbuje prawdziwego
 * navigator.geolocation.getCurrentPosition() — ten POPRAWNIE widzi realny
 * stan zgody niezależnie od permissions.query — a potem doczepiamy
 * navigator.geolocation.watchPosition() do ciągłych aktualizacji.
 *
 * NATYWNA appka: bez zmian — pasywny odczyt przez checkLocationPermission,
 * bez promptu przy montowaniu.
 */
export function useWatchingLocation(enabled = true): UserLocationState {
  const [state, setState] = useState<{ status: LocationStatus; coords: LngLat | null }>({
    status: 'loading',
    coords: null,
  });
  const requestSeqRef = useRef(0);
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const webWatchIdRef = useRef<number | null>(null);

  const startWatchingWeb = useCallback(async (seq: number): Promise<LocationStatus> => {
    const result = await getCurrentLocation();
    if (seq !== requestSeqRef.current) return 'loading';

    if (!result.ok) {
      const status: LocationStatus =
        result.error === 'PERMISSION_DENIED'
          ? 'denied'
          : result.error === 'TIMEOUT'
            ? 'timeout'
            : 'unavailable';
      setState({ status, coords: null });
      return status;
    }

    setState({ status: 'granted', coords: result.coords });

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          if (seq !== requestSeqRef.current) return;
          setState({
            status: 'granted',
            coords: [position.coords.longitude, position.coords.latitude],
          });
        },
        () => {
          // Błąd w trakcie ŚLEDZENIA (nie pierwszego odczytu) — zostajemy przy
          // ostatnio znanej pozycji zamiast czyścić UI na pojedynczy zgubiony fix.
        },
        { enableHighAccuracy: true, maximumAge: 5000 },
      );
      webWatchIdRef.current = watchId;
    }

    return 'granted';
  }, []);

  const startWatchingNative = useCallback(async (seq: number): Promise<LocationStatus> => {
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

  const startWatching = useCallback(async (): Promise<LocationStatus> => {
    const seq = ++requestSeqRef.current;
    subscriptionRef.current?.remove();
    subscriptionRef.current = null;
    if (webWatchIdRef.current != null && typeof navigator !== 'undefined') {
      navigator.geolocation.clearWatch(webWatchIdRef.current);
      webWatchIdRef.current = null;
    }
    setState((prev) => ({ ...prev, status: 'loading' }));

    return Platform.OS === 'web' ? startWatchingWeb(seq) : startWatchingNative(seq);
  }, [startWatchingWeb, startWatchingNative]);

  useEffect(() => {
    if (!enabled) return;
    void startWatching();
    return () => {
      requestSeqRef.current += 1;
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
      if (webWatchIdRef.current != null && typeof navigator !== 'undefined') {
        navigator.geolocation.clearWatch(webWatchIdRef.current);
        webWatchIdRef.current = null;
      }
    };
  }, [enabled, startWatching]);

  const requestLocation = useCallback(() => {
    if (!enabled) return Promise.resolve<LocationStatus>('denied');
    return startWatching();
  }, [enabled, startWatching]);

  return { ...state, requestLocation };
}

export type { LocationStatus, LngLat };
