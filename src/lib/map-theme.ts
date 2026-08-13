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
 * Ile ikonek maksymalnie mieści siatka wewnątrz jednego bąbla klastra:
 * 1 wyśrodkowana, 2 obok siebie, 3-4 w układzie 2x2. Więcej niż 4 obecne
 * kategorie -> pokazujemy pierwsze 3 (wg kolejności w CLUSTER_CATEGORY_KEYS)
 * + piktogram "more" na czwartej pozycji, nigdy więcej niż 4 elementy.
 */
export const CLUSTER_GRID_MAX_SLOTS = 4;

export type ClusterIconSlot = ClusterCategoryKey | 'more';

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
 * Progi rozmiaru siatki ikon klastra — TE SAME progi `total_events` co
 * circleRadius bąbla (1/5/15/40), żeby ikony rosły razem z bąblem: więcej
 * eventów w klastrze -> większy bąbel -> wyraźnie większe, czytelne ikony,
 * zamiast stałego, drobnego rozmiaru niezależnego od tego, ile się tam
 * dzieje. gapX/rowY to piksele dobrane pod dany iconSize, żeby siatka nie
 * zaczęła zachodzić na siebie przy większych ikonach.
 *
 * Mapbox expressions nie potrafią wyliczyć tablicy [x, y] z arytmetyki w
 * runtime (`icon-offset` przyjmuje tylko literalne stałe) — stąd skończony
 * zestaw progów zamiast płynnej interpolacji rozstawu.
 */
const CLUSTER_SIZE_TIERS = [
  { total: 1, icon: 0.5, gapX: 12, singleRowY: 16, topRowY: 8, bottomRowY: 26 },
  { total: 5, icon: 0.62, gapX: 15, singleRowY: 20, topRowY: 10, bottomRowY: 32 },
  { total: 15, icon: 0.74, gapX: 18, singleRowY: 24, topRowY: 12, bottomRowY: 38 },
  { total: 40, icon: 0.86, gapX: 21, singleRowY: 28, topRowY: 14, bottomRowY: 44 },
] as const;

/** Rozmiar ikon w siatce klastra — rośnie z `total_events`, tymi samymi progami co bąbel. */
export function buildClusterIconSizeExpression(): any {
  const expr: any[] = ['step', ['get', 'total_events'], CLUSTER_SIZE_TIERS[0].icon];
  for (let i = 1; i < CLUSTER_SIZE_TIERS.length; i++) {
    expr.push(CLUSTER_SIZE_TIERS[i].total, CLUSTER_SIZE_TIERS[i].icon);
  }
  return expr;
}

function tierOffsetExpr(pick: (tier: (typeof CLUSTER_SIZE_TIERS)[number]) => readonly [number, number]): any {
  const expr: any[] = ['step', ['get', 'total_events'], ['literal', pick(CLUSTER_SIZE_TIERS[0])]];
  for (let i = 1; i < CLUSTER_SIZE_TIERS.length; i++) {
    expr.push(CLUSTER_SIZE_TIERS[i].total, ['literal', pick(CLUSTER_SIZE_TIERS[i])]);
  }
  return expr;
}

/**
 * Pozycja ikony w danym slocie — zależna od CAŁKOWITEJ liczby obecnych
 * kategorii (1 vs 2 vs 3-4 zmienia układ: wyśrodkowana / para w rzędzie /
 * 2x2) ORAZ od rozmiaru bąbla (patrz CLUSTER_SIZE_TIERS powyżej).
 */
export function buildClusterIconSlotOffsetExpression(slotIndex: 0 | 1 | 2 | 3): any {
  const total = totalPresentExpr();
  if (slotIndex === 0) {
    return [
      'case',
      ['==', total, 1], tierOffsetExpr((t) => [0, t.singleRowY]),
      ['==', total, 2], tierOffsetExpr((t) => [-t.gapX, t.singleRowY]),
      tierOffsetExpr((t) => [-t.gapX, t.topRowY]),
    ];
  }
  if (slotIndex === 1) {
    return [
      'case',
      ['==', total, 2], tierOffsetExpr((t) => [t.gapX, t.singleRowY]),
      tierOffsetExpr((t) => [t.gapX, t.topRowY]),
    ];
  }
  if (slotIndex === 2) {
    return tierOffsetExpr((t) => [-t.gapX, t.bottomRowY]);
  }
  return tierOffsetExpr((t) => [t.gapX, t.bottomRowY]);
}

