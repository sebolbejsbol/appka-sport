import { Brand } from '@/constants/theme';
import { t } from '@/i18n';
import type { CourtAvailability } from '@/lib/fields';

/**
 * Jedno źródło prawdy dla koloru dostępności boiska/klastra (zielony = dużo
 * wolnych terminów, pomarańczowy = mało, czerwony = pełne, szary = brak
 * eventów). Wcześniej ten sam 4-stanowy mapping był powielony osobno w
 * map-view.tsx, map-view.web.tsx i map-nearby-sheet.tsx.
 */
export const MAP_STATUS_COLORS: Record<CourtAvailability, string> = {
  open: Brand.success,
  filling: Brand.warning,
  full: Brand.danger,
  empty: '#94a3b8',
};

export function getAvailabilityColor(availability: CourtAvailability): string {
  return MAP_STATUS_COLORS[availability] ?? MAP_STATUS_COLORS.empty;
}

export function getAvailabilityLabel(availability: CourtAvailability): string {
  switch (availability) {
    case 'open':
      return t('map.nearby.availabilityOpen');
    case 'filling':
      return t('map.nearby.availabilityFilling');
    case 'full':
      return t('map.nearby.availabilityFull');
    default:
      return t('map.nearby.availabilityEmpty');
  }
}

/**
 * Mapbox style expressions nie mogą wywołać funkcji JS w runtime — więc
 * "scentralizowanie" logiki koloru dla warstw mapy oznacza jedną funkcję,
 * która generuje ten sam literal `['case', ...]`, zamiast ręcznie kopiować
 * tablicę w map-view.tsx i map-view.web.tsx osobno.
 *
 * Klaster: kolor wg priorytetu open > filling > full > brak eventów, licząc
 * po zagregowanych właściwościach klastra (open_count/filling_count/full_count
 * z CLUSTER_AVAILABILITY_PROPERTIES).
 *
 * Zwracamy `any[]` celowo — Mapbox nie eksportuje publicznie swojego
 * rekurencyjnego typu `Expression` (@rnmapbox/maps ogranicza importy do
 * package.json "exports"), a natywny i webowy CircleLayer mają dwa różne,
 * niekompatybilne typy stylu. Inline literały działały tylko dzięki
 * kontekstowemu wnioskowaniu typu w miejscu użycia — po wydzieleniu do
 * funkcji ta ścieżka wnioskowania i tak znika.
 */
export function buildClusterStatusColorExpression(): any {
  return [
    'case',
    ['>', ['get', 'open_count'], 0], MAP_STATUS_COLORS.open,
    ['>', ['get', 'filling_count'], 0], MAP_STATUS_COLORS.filling,
    ['>', ['get', 'full_count'], 0], MAP_STATUS_COLORS.full,
    MAP_STATUS_COLORS.empty,
  ];
}

/** Pojedyncze boisko: kolor wg właściwości `availability` zapisanej na punkcie. */
export function buildAvailabilityMatchExpression(): any {
  return [
    'match',
    ['get', 'availability'],
    'full', MAP_STATUS_COLORS.full,
    'filling', MAP_STATUS_COLORS.filling,
    'open', MAP_STATUS_COLORS.open,
    MAP_STATUS_COLORS.empty,
  ];
}

