import type { LngLat } from '@/lib/geo';

export type PlaceSearchResult = {
  id: string;
  label: string;
  subtitle: string | null;
  center: LngLat;
};

type MapboxFeature = {
  id: string;
  place_name?: string;
  text?: string;
  center?: [number, number];
  context?: { text?: string }[];
};

export async function searchMapPlaces(
  query: string,
): Promise<{ data: PlaceSearchResult[]; error: boolean }> {
  const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
  const q = query.trim();
  if (!token || q.length < 2) return { data: [], error: false };

  const params = new URLSearchParams({
    access_token: token,
    country: 'pl',
    language: 'pl',
    // address + poi = wyszukiwanie po ulicach i miejscach, nie tylko miastach
    types: 'address,poi,place,locality,neighborhood,district,postcode',
    limit: '8',
    autocomplete: 'true',
  });

  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?${params}`,
    );
    if (!res.ok) return { data: [], error: true };

    const json = (await res.json()) as { features?: MapboxFeature[] };
    const data = (json.features ?? [])
      .map((feature) => {
        const center = feature.center;
        if (!center || center.length < 2) return null;
        const [lng, lat] = center;
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

        const label = feature.text?.trim() || feature.place_name?.split(',')[0]?.trim() || '';
        if (!label) return null;

        const subtitle = feature.place_name?.trim() || null;

        return {
          id: feature.id,
          label,
          subtitle: subtitle && subtitle !== label ? subtitle : null,
          center: [lng, lat] as LngLat,
        };
      })
      .filter((row): row is PlaceSearchResult => row != null);

    return { data, error: false };
  } catch {
    return { data: [], error: true };
  }
}

/** Zwraca czytelną nazwę miejsca dla współrzędnych (reverse geocoding). */
export async function reverseGeocode(coords: LngLat): Promise<string | null> {
  const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
  if (!token) return null;
  const [lng, lat] = coords;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

  const params = new URLSearchParams({
    access_token: token,
    language: 'pl',
    types: 'address,poi,neighborhood,locality,place',
    limit: '1',
  });

  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?${params}`,
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { features?: MapboxFeature[] };
    const feature = json.features?.[0];
    return feature?.place_name?.trim() || feature?.text?.trim() || null;
  } catch {
    return null;
  }
}
