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

/**
 * Ile ikonek maksymalnie mieści siatka wewnątrz jednego bąbla klastra:
 * 1 wyśrodkowana, 2 obok siebie, 3-4 w układzie 2x2. Więcej niż 4 obecne
 * kategorie -> pokazujemy pierwsze 3 (wg kolejności w CLUSTER_CATEGORY_KEYS)
 * + piktogram "more" na czwartej pozycji, nigdy więcej niż 4 elementy.
 */
export const CLUSTER_GRID_MAX_SLOTS = 4;

export type ClusterIconSlot = ClusterCategoryKey | 'more';

/** Kategorie obecne w klastrze (liczba > 0), w stałej kolejności priorytetu. */
export function presentCategories(
  counts: Partial<Record<ClusterCategoryKey, number>>,
): ClusterCategoryKey[] {
  return CLUSTER_CATEGORY_KEYS.filter((key) => (counts[key] ?? 0) > 0);
}

/**
 * Czysta logika przypisania kategorii do slotów siatki (0-3) — wydzielona
 * osobno od budowniczych wyrażeń Mapboxa poniżej, żeby dało się ją
 * przetestować bez atrapy silnika wyrażeń. Obie ścieżki MUSZĄ zwracać ten
 * sam wynik dla tych samych liczników, inaczej podgląd w testach rozjedzie
 * się z prawdziwą mapą — stąd zwracamy dokładnie to, co ma się wyrenderować,
 * pozycja po pozycji (indeks tablicy = slot), zamiast samej liczby.
 */
export function clusterIconSlots(
  counts: Partial<Record<ClusterCategoryKey, number>>,
): ClusterIconSlot[] {
  const present = presentCategories(counts);
  if (present.length <= CLUSTER_GRID_MAX_SLOTS) return present;
  return [...present.slice(0, CLUSTER_GRID_MAX_SLOTS - 1), 'more'];
}

function presentExpr(key: ClusterCategoryKey): any {
  return ['>', ['get', `count_${key}`], 0];
}

/** Liczba obecnych kategorii ze ŚCIŚLE wyższym priorytetem (wcześniejszych w CLUSTER_CATEGORY_KEYS) niż `key`. */
function rankIndexExpr(key: ClusterCategoryKey): any {
  const earlier = CLUSTER_CATEGORY_KEYS.slice(0, CLUSTER_CATEGORY_KEYS.indexOf(key));
  if (earlier.length === 0) return 0;
  return ['+', ...earlier.map((k) => ['case', presentExpr(k), 1, 0])];
}

function totalPresentExpr(): any {
  return ['+', ...CLUSTER_CATEGORY_KEYS.map((k) => ['case', presentExpr(k), 1, 0])];
}

/** Ikona kategorii, której rangą (kolejność wśród obecnych) jest `slotIndex` — 'generic' dla "other". */
function slotCategoryIconExpr(slotIndex: number): any {
  const cases: any[] = ['case'];
  for (const key of CLUSTER_CATEGORY_KEYS) {
    cases.push(
      ['all', presentExpr(key), ['==', rankIndexExpr(key), slotIndex]],
      key === 'other' ? 'generic' : key,
    );
  }
  cases.push('generic');
  return cases;
}

/**
 * Obraz do wyświetlenia w danym slocie (0-3) siatki ikon klastra. Slot 3 to
 * piktogram "more", jeśli obecnych kategorii jest więcej niż 4 — w
 * przeciwnym razie (dokładnie 4) to zwykła 4. kategoria wg rangi.
 */
export function buildClusterIconSlotExpression(slotIndex: 0 | 1 | 2 | 3): any {
  if (slotIndex === 3) {
    return ['case', ['>', totalPresentExpr(), CLUSTER_GRID_MAX_SLOTS], 'more', slotCategoryIconExpr(3)];
  }
  return slotCategoryIconExpr(slotIndex);
}

/** Czy dany slot w ogóle powinien się wyrenderować dla tego klastra (ma tyle obecnych kategorii). */
export function buildClusterIconSlotVisibleFilter(slotIndex: 0 | 1 | 2 | 3): any {
  return ['>=', totalPresentExpr(), slotIndex + 1];
}

/**
 * Stała, deterministyczna geometria siatki (px, względem środka bąbla):
 * 1 ikona -> wyśrodkowana w jednym rzędzie; 2 -> para w tym samym rzędzie;
 * 3-4 -> pełny układ 2x2. Liczba aktywnych eventów renderuje się NAD siatką
 * (ujemny textOffset w warstwie tekstu), więc oba rzędy siatki leżą poniżej
 * środka bąbla.
 */
const CLUSTER_ICON_GRID = { gapX: 9, singleRowY: 13, topRowY: 6, bottomRowY: 20 } as const;

/** Pozycja ikony w danym slocie — zależna od CAŁKOWITEJ liczby obecnych kategorii (1 vs 2 vs 3-4 zmienia układ). */
export function buildClusterIconSlotOffsetExpression(slotIndex: 0 | 1 | 2 | 3): any {
  const total = totalPresentExpr();
  const g = CLUSTER_ICON_GRID;
  if (slotIndex === 0) {
    return [
      'case',
      ['==', total, 1], ['literal', [0, g.singleRowY]],
      ['==', total, 2], ['literal', [-g.gapX, g.singleRowY]],
      ['literal', [-g.gapX, g.topRowY]],
    ];
  }
  if (slotIndex === 1) {
    return [
      'case',
      ['==', total, 2], ['literal', [g.gapX, g.singleRowY]],
      ['literal', [g.gapX, g.topRowY]],
    ];
  }
  if (slotIndex === 2) {
    return ['literal', [-g.gapX, g.bottomRowY]];
  }
  return ['literal', [g.gapX, g.bottomRowY]];
}

