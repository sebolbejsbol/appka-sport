import * as Location from 'expo-location';
import { router } from 'expo-router';
import { Linking, Platform } from 'react-native';

import { t } from '@/i18n';
import { distanceMeters, formatDistance, type LngLat } from '@/lib/geo';
import { notifyError } from '@/lib/toast';

export type FieldDestination = {
  lat: number;
  lng: number;
  name?: string | null;
  fieldId?: string;
};

export type FieldRoute = {
  geometry: GeoJSON.LineString;
  distanceMeters: number;
  durationSeconds: number;
};

export type StartNavigationResult =
  | 'google_maps'
  | 'in_app'
  | 'location_denied'
  | 'location_error'
  | 'invalid_destination';

/**
 * Środek transportu do nawigacji w apce. Mapbox Directions nie ma osobnego
 * profilu dla hulajnogi — najbliższy rzeczywisty odpowiednik (te same drogi
 * rowerowe/piesze, zbliżona prędkość rzeczywista e-hulajnóg) to `cycling`,
 * więc "rower" i "hulajnoga" celowo dzielą jeden tryb zamiast dwóch
 * identycznych czasowo przycisków.
 */
export type TravelProfile = 'walking' | 'cycling' | 'driving';

/** Mapbox Directions API profile segment dla danego środka transportu. */
const MAPBOX_PROFILE: Record<TravelProfile, string> = {
  walking: 'walking',
  cycling: 'cycling',
  driving: 'driving',
};

/** Przybliżona prędkość używana TYLKO jako fallback, gdy Directions API zawiedzie (patrz fetchRoute). */
const FALLBACK_SPEED_MPS: Record<TravelProfile, number> = {
  walking: 5000 / 3600,
  cycling: 15000 / 3600,
  driving: 35000 / 3600,
};

export function formatDuration(seconds: number): string {
  const totalMin = Math.max(1, Math.round(seconds / 60));
  if (totalMin < 60) return `${totalMin} min`;
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
}

export async function isGoogleMapsInstalled(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    if (Platform.OS === 'ios') {
      return await Linking.canOpenURL('comgooglemaps://');
    }
    return await Linking.canOpenURL('google.navigation:q=0,0');
  } catch {
    return false;
  }
}

export async function openGoogleMapsNavigation(dest: FieldDestination): Promise<boolean> {
  const { lat, lng } = dest;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;

  try {
    if (Platform.OS === 'android') {
      await Linking.openURL(`google.navigation:q=${lat},${lng}`);
      return true;
    }
    if (Platform.OS === 'ios') {
      await Linking.openURL(
        `comgooglemaps://?daddr=${lat},${lng}&directionsmode=walking`,
      );
      return true;
    }
    await Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`,
    );
    return true;
  } catch {
    return false;
  }
}

export async function getCurrentUserCoords(): Promise<LngLat | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const lastKnown = await Location.getLastKnownPositionAsync();
    if (lastKnown) {
      return [lastKnown.coords.longitude, lastKnown.coords.latitude];
    }

    const current = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return [current.coords.longitude, current.coords.latitude];
  } catch {
    return null;
  }
}

export async function fetchRoute(
  from: LngLat,
  to: LngLat,
  profile: TravelProfile = 'walking',
): Promise<{ data: FieldRoute | null; error: string | null }> {
  const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
  if (!token) return { data: null, error: 'missing_token' };

  const [fromLng, fromLat] = from;
  const [toLng, toLat] = to;
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/${MAPBOX_PROFILE[profile]}/` +
    `${fromLng},${fromLat};${toLng},${toLat}` +
    `?geometries=geojson&overview=full&access_token=${encodeURIComponent(token)}`;

  try {
    const response = await fetch(url);
    const json = (await response.json()) as {
      routes?: {
        geometry?: GeoJSON.LineString;
        distance?: number;
        duration?: number;
      }[];
      message?: string;
    };

    const route = json.routes?.[0];
    if (route?.geometry?.coordinates?.length) {
      return {
        data: {
          geometry: route.geometry,
          distanceMeters: Number(route.distance) || distanceMeters(from, to),
          durationSeconds: Number(route.duration) || distanceMeters(from, to) / FALLBACK_SPEED_MPS[profile],
        },
        error: null,
      };
    }
  } catch {
    // fallback below
  }

  const straight = distanceMeters(from, to);
  return {
    data: {
      geometry: { type: 'LineString', coordinates: [from, [toLng, toLat]] },
      distanceMeters: straight,
      durationSeconds: straight / FALLBACK_SPEED_MPS[profile],
    },
    error: null,
  };
}

export function openInAppNavigation(dest: FieldDestination) {
  router.push({
    pathname: '/field/navigate',
    params: {
      lat: String(dest.lat),
      lng: String(dest.lng),
      name: dest.name ?? '',
      fieldId: dest.fieldId ?? '',
    },
  });
}

export async function startFieldNavigation(
  dest: FieldDestination,
  options?: { userCoords?: LngLat | null; closeBeforeNavigate?: () => void },
): Promise<StartNavigationResult> {
  if (!Number.isFinite(dest.lat) || !Number.isFinite(dest.lng)) {
    return 'invalid_destination';
  }

  const userCoords = options?.userCoords ?? (await getCurrentUserCoords());
  if (!userCoords) {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status === 'denied') return 'location_denied';
    return 'location_error';
  }

  if (await isGoogleMapsInstalled()) {
    const opened = await openGoogleMapsNavigation(dest);
    if (opened) return 'google_maps';
  }

  options?.closeBeforeNavigate?.();
  openInAppNavigation(dest);
  return 'in_app';
}

export function showNavigationError(result: Exclude<StartNavigationResult, 'google_maps' | 'in_app'>) {
  const message =
    result === 'location_denied'
      ? t('fieldNavigation.locationDenied')
      : result === 'invalid_destination'
        ? t('fieldNavigation.invalidDestination')
        : t('fieldNavigation.locationError');
  notifyError(message);
}

export function formatRouteSummary(route: FieldRoute): { distance: string; duration: string } {
  return {
    distance: formatDistance(route.distanceMeters),
    duration: formatDuration(route.durationSeconds),
  };
}
