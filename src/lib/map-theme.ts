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

/**
 * Kategorie sportu pokazywane jako mini-ikonki wewnątrz bąbla klastra.
 * Wspólne dla map-view.tsx i map-view.web.tsx.
 */
export const CLUSTER_ICON_SPORTS = [
  'basketball',
  'football',
  'tennis',
  'volleyball',
  'fitness',
  'swimming',
  'hockey',
] as const;

const CLUSTER_CATEGORY_KEYS = [...CLUSTER_ICON_SPORTS, 'other'] as const;
export type ClusterCategoryKey = (typeof CLUSTER_CATEGORY_KEYS)[number];

/** "fitness" jako kategoria obejmuje dwa typy boisk z OSM (siłownia plenerowa = też siłownia). */
function clusterSportCondition(sport: string): any {
  if (sport === 'fitness') {
    return ['in', ['get', 'sport'], ['literal', ['fitness', 'outdoor_gym']]];
  }
  return ['==', ['get', 'sport'], sport];
}

/**
 * `clusterProperties` do przekazania w `<ShapeSource>` — po jednym liczniku
 * per nazwana kategoria plus `count_other` (wszystko spoza CLUSTER_ICON_SPORTS),
 * żeby dało się wyznaczyć, które kategorie są obecne w klastrze (i w jakiej
 * kolejności) do siatki ikon poniżej.
 */
export function buildClusterCategoryProperties(): Record<string, any> {
  const props: Record<string, any> = {};
  for (const sport of CLUSTER_ICON_SPORTS) {
    props[`count_${sport}`] = ['+', ['case', clusterSportCondition(sport), 1, 0]];
  }
  props.count_other = ['+', ['case', ['any', ...CLUSTER_ICON_SPORTS.map(clusterSportCondition)], 0, 1]];
  return props;
}

/** Kategorie obecne w klastrze (liczba > 0), w stałej kolejności priorytetu. */
export function presentCategories(
  counts: Partial<Record<ClusterCategoryKey, number>>,
): ClusterCategoryKey[] {
  return CLUSTER_CATEGORY_KEYS.filter((key) => (counts[key] ?? 0) > 0);
}

/**
 * Jedna ikona na bąbel (obok liczby eventów), nie siatka — mały bąbel nie ma
 * miejsca na kilka piktogramów naraz i musi być czytelny na pierwszy rzut
 * oka. Wybieramy kategorię z NAJWIĘKSZĄ liczbą obiektów w klastrze; przy
 * remisie wygrywa ta wcześniejsza w CLUSTER_CATEGORY_KEYS (deterministyczne,
 * stabilne między odświeżeniami). "other" (poza siedmioma śledzonymi sportami)
 * pokazuje neutralną ikonę 'generic', bo nie wskazuje jednego konkretnego typu.
 *
 * Czysta wersja do testów — MUSI zwracać ten sam wynik co
 * buildClusterDominantIconExpression() dla tych samych liczników, inaczej
 * podgląd w testach rozjedzie się z prawdziwą mapą.
 */
export function dominantCategory(
  counts: Partial<Record<ClusterCategoryKey, number>>,
): ClusterCategoryKey | null {
  let best: ClusterCategoryKey | null = null;
  let bestCount = 0;
  for (const key of CLUSTER_CATEGORY_KEYS) {
    const count = counts[key] ?? 0;
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

function countExpr(key: ClusterCategoryKey): any {
  return ['get', `count_${key}`];
}

/** Ikona najliczniejszej kategorii w klastrze — 'generic' gdy brak danych lub wygrywa "other". */
export function buildClusterDominantIconExpression(): any {
  const cases: any[] = ['case'];
  for (const key of CLUSTER_CATEGORY_KEYS) {
    const others = CLUSTER_CATEGORY_KEYS.filter((k) => k !== key);
    const isMax = ['all', ...others.map((k) => ['>=', countExpr(key), countExpr(k)])];
    cases.push(isMax, key === 'other' ? 'generic' : key);
  }
  cases.push('generic');
  return cases;
}

