import type { LngLat } from '@/hooks/use-user-location';
import type { Bbox } from '@/lib/fields';
import { distanceMeters } from '@/lib/geo';

/** Przybliżony prostokąt widoczny wokół centrum mapy (gdy SDK nie zwraca bounds). */
export function bboxAroundCenter(center: LngLat, zoom: number): Bbox {
  const [lng, lat] = center;
  // Szerszy zasięg niż wcześniej — więcej boisk „z wyprzedzeniem".
  const latSpan = (180 / 2 ** zoom) * 0.75;
  const lngSpan = latSpan * Math.cos((lat * Math.PI) / 180);

  return {
    minLng: lng - lngSpan,
    minLat: lat - latSpan,
    maxLng: lng + lngSpan,
    maxLat: lat + latSpan,
  };
}

/** Poszerza prostokąt o podany współczynnik (1.8 = +80% w każdą stronę). */
export function expandBbox(bbox: Bbox, factor = 1.8): Bbox {
  const lngSpan = bbox.maxLng - bbox.minLng;
  const latSpan = bbox.maxLat - bbox.minLat;
  const padLng = (lngSpan * (factor - 1)) / 2;
  const padLat = (latSpan * (factor - 1)) / 2;

  return {
    minLng: bbox.minLng - padLng,
    minLat: bbox.minLat - padLat,
    maxLng: bbox.maxLng + padLng,
    maxLat: bbox.maxLat + padLat,
  };
}

/**
 * Limit punktów pobieranych dla widocznego obszaru. Wyższe wartości przy
 * średnim/szerokim oddaleniu sprawiają, że boiska są „obecne" na całej mapie
 * i pojawiają się płynnie z przybliżaniem (a nie dopiero po wejściu w miasto).
 * Sortowanie w RPC jest przestrzennie równomierne, więc nawet ucięta próbka
 * pokrywa cały widok.
 */
export function maxRowsForZoom(zoom: number): number {
  if (zoom >= 14) return 500;
  if (zoom >= 12) return 1000;
  if (zoom >= 10) return 1600;
  if (zoom >= 8) return 2000;
  return 1800;
}

/** Domyślny widok: cała Polska. */
export const POLAND_BBOX: Bbox = {
  minLng: 14.12,
  minLat: 49.0,
  maxLng: 24.15,
  maxLat: 54.84,
};

/** Środek Polski (fallback bez GPS). */
export const POLAND_CENTER: LngLat = [19.48, 52.07];

/** @deprecated Użyj POLAND_BBOX — zachowane dla kompatybilności importów. */
export const TRICITY_BBOX: Bbox = POLAND_BBOX;

/**
 * Centroid Gdańsk/Gdynia/Sopot — środek promienia, którym ograniczamy tworzenie
 * wydarzeń do jedynego odblokowanego regionu (patrz też
 * supabase/migrations/0092_lock_event_creation_to_tricity.sql, ten sam
 * środek/promień po stronie bazy — TU zmiana jest tylko wcześniejszym,
 * przyjaznym ostrzeżeniem; prawdziwe wymuszenie jest w triggerze).
 */
export const TRICITY_CENTER: LngLat = [18.579, 54.438];
/** 25 km — z zapasem obejmuje Gdańsk+Gdynię+Sopot i najbliższe okolice (Rumia, Reda, Pruszcz Gdański). */
export const TRICITY_RADIUS_KM = 25;

/** Czy punkt leży w promieniu odblokowanego regionu (Trójmiasto + okolice). */
export function isWithinTricity(coords: LngLat): boolean {
  return distanceMeters(coords, TRICITY_CENTER) <= TRICITY_RADIUS_KM * 1000;
}
