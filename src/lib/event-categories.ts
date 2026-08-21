/**
 * Kategorie i podkategorie wydarzeń — wspólne dla zakładki Eventy i mapy.
 * Stabilne identyfikatory (ASCII), kolory + emoji do markerów.
 * Etykiety widoczne dla użytkownika pochodzą z i18n (t()) — patrz categoryLabel/subcategoryLabel,
 * dzięki czemu zmiana języka działa również dla kategorii i podkategorii.
 */
import { Brand } from '@/constants/theme';
import { t, type TKey } from '@/i18n';

export const EVENT_CATEGORIES = [
  'sport',
  'hobby',
  'rekreacja',
  'kultura',
  'muzyka',
  'edukacja',
  'biznes',
  'inne',
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];

/** Filtr kategorii (z opcją „wszystkie"). */
export type CategoryFilter = EventCategory | 'all';

export type CategoryMeta = {
  id: EventCategory;
  label: string;
  emoji: string;
  /** Kolor markera/etykiety. */
  color: string;
  /** Tło etykiety. */
  tint: string;
};

export const CATEGORY_META: Record<EventCategory, CategoryMeta> = {
  sport: { id: 'sport', label: 'Sport', emoji: '🏀', color: '#1f6bff', tint: '#e9f0ff' },
  hobby: { id: 'hobby', label: 'Hobby', emoji: '🎨', color: '#8b5cf6', tint: '#f5f3ff' },
  rekreacja: { id: 'rekreacja', label: 'Rekreacja', emoji: '🌳', color: '#10b981', tint: '#ecfdf5' },
  kultura: { id: 'kultura', label: 'Kultura', emoji: '🎭', color: '#ec4899', tint: '#fdf2f8' },
  muzyka: { id: 'muzyka', label: 'Muzyka', emoji: '🎵', color: '#f59e0b', tint: '#fffbeb' },
  edukacja: { id: 'edukacja', label: 'Edukacja', emoji: '📚', color: '#3b82f6', tint: '#eff6ff' },
  biznes: { id: 'biznes', label: 'Biznes', emoji: '💼', color: '#64748b', tint: '#f1f5f9' },
  inne: { id: 'inne', label: 'Inne', emoji: '✨', color: '#6b7280', tint: '#f3f4f6' },
};

export type SubcategoryMeta = {
  id: string;
  label: string;
};

/** Drzewo podkategorii. Kategorie bez podkategorii mają pustą listę. */
export const SUBCATEGORIES: Record<EventCategory, SubcategoryMeta[]> = {
  sport: [
    { id: 'basketball', label: 'Koszykówka' },
    { id: 'football', label: 'Piłka nożna' },
    { id: 'volleyball', label: 'Siatkówka' },
    { id: 'tennis', label: 'Tenis' },
    { id: 'running', label: 'Bieganie' },
    { id: 'swimming', label: 'Pływanie' },
    { id: 'climbing', label: 'Wspinaczka' },
    { id: 'skatepark', label: 'Skatepark' },
    { id: 'padel', label: 'Padel' },
    { id: 'badminton', label: 'Badminton' },
    { id: 'fitness', label: 'Siłownia' },
    { id: 'outdoor_gym', label: 'Siłownia plenerowa' },
    { id: 'handball', label: 'Piłka ręczna' },
  ],
  hobby: [
    { id: 'painting', label: 'Malarstwo' },
    { id: 'drawing', label: 'Rysunek' },
    { id: 'photography', label: 'Fotografia' },
    { id: 'cooking', label: 'Gotowanie' },
    { id: 'chess', label: 'Szachy' },
    { id: 'ceramics', label: 'Ceramika' },
    { id: 'crafts', label: 'Rękodzieło' },
  ],
  rekreacja: [
    { id: 'walk', label: 'Spacer' },
    { id: 'cycling', label: 'Rower' },
    { id: 'yoga', label: 'Joga' },
    { id: 'outdoor', label: 'Na świeżym powietrzu' },
  ],
  kultura: [
    { id: 'exhibition', label: 'Wystawa' },
    { id: 'theatre', label: 'Teatr' },
    { id: 'cinema', label: 'Kino' },
    { id: 'author_meeting', label: 'Spotkanie autorskie' },
  ],
  muzyka: [
    { id: 'concert', label: 'Koncert' },
    { id: 'dj_set', label: 'DJ Set' },
    { id: 'festival', label: 'Festiwal' },
    { id: 'jam_session', label: 'Jam Session' },
    { id: 'music_club', label: 'Klub muzyczny' },
  ],
  edukacja: [
    { id: 'workshop', label: 'Warsztaty' },
    { id: 'course', label: 'Kurs' },
    { id: 'training', label: 'Szkolenie' },
    { id: 'lecture', label: 'Wykład' },
  ],
  biznes: [
    { id: 'networking', label: 'Networking' },
    { id: 'conference', label: 'Konferencja' },
    { id: 'meetup', label: 'Meetup' },
    { id: 'fair', label: 'Targi' },
  ],
  inne: [],
};

/** Znane identyfikatory podkategorii (do rozpoznania, czy mamy tłumaczenie). */
const KNOWN_SUBCATEGORY_IDS = new Set<string>();
for (const list of Object.values(SUBCATEGORIES)) {
  for (const sub of list) KNOWN_SUBCATEGORY_IDS.add(sub.id);
}

/** Emoji markera dla konkretnej podkategorii (segregacja znaczników na mapie). */
const SUBCATEGORY_EMOJI: Record<string, string> = {
  // sport
  basketball: '🏀',
  football: '⚽',
  volleyball: '🏐',
  tennis: '🎾',
  running: '🏃',
  swimming: '🏊',
  climbing: '🧗',
  skatepark: '🛹',
  padel: '🎾',
  badminton: '🏸',
  fitness: '💪',
  outdoor_gym: '🏋️',
  handball: '🤾',
  // hobby
  painting: '🎨',
  drawing: '✏️',
  photography: '📷',
  cooking: '🍳',
  chess: '♟️',
  ceramics: '🏺',
  crafts: '🧶',
  // rekreacja
  walk: '🚶',
  cycling: '🚴',
  yoga: '🧘',
  outdoor: '🌲',
  // kultura
  exhibition: '🖼️',
  theatre: '🎭',
  cinema: '🎬',
  author_meeting: '📖',
  // muzyka
  concert: '🎤',
  dj_set: '🎧',
  festival: '🎪',
  jam_session: '🎸',
  music_club: '🎶',
  // edukacja
  workshop: '🛠️',
  course: '📝',
  training: '🎓',
  lecture: '🗣️',
  // biznes
  networking: '🤝',
  conference: '🏢',
  meetup: '👥',
  fair: '🎟️',
};

/** Emoji markera: precyzyjne dla podkategorii, w innym razie emoji kategorii. */
export function markerEmoji(category: string, subcategory: string | null | undefined): string {
  if (subcategory && SUBCATEGORY_EMOJI[subcategory]) return SUBCATEGORY_EMOJI[subcategory];
  return categoryEmoji(category);
}

/**
 * categoryMeta().color jest STAŁY (zawsze ten sam niebieski, bo `category`
 * to prawie zawsze 'sport' — apka skupia się wyłącznie na sporcie, patrz
 * DEFAULT_DISCOVER_FILTERS) — każda karta eventu pokazywała identyczny
 * kolor/emoji niezależnie od realnej dyscypliny. To realny kolor PER SPORT
 * (subcategory), do kart/nagłówków, gdzie kolor ma nieść informację, nie
 * tylko "to jest sport". Cykluje przez paletę marki zamiast wymyślać nowe
 * kolory per dyscyplina.
 */
const SUBCATEGORY_ACCENT: Record<string, string> = {
  basketball: Brand.primary,
  football: Brand.pitch,
  volleyball: Brand.teal,
  tennis: Brand.amberDark,
  padel: Brand.amberDark,
  badminton: Brand.teal,
  running: Brand.pitch,
  swimming: Brand.teal,
  climbing: Brand.ink,
  skatepark: Brand.ink,
  fitness: Brand.primary,
  outdoor_gym: Brand.pitch,
  handball: Brand.primary,
};

export function subcategoryAccentColor(subcategory: string | null | undefined): string {
  if (subcategory && SUBCATEGORY_ACCENT[subcategory]) return SUBCATEGORY_ACCENT[subcategory];
  return Brand.primary;
}

/**
 * Klucz gotowej ikonki PNG wydarzenia (kolor kategorii + wypalone emoji).
 * Patrz scripts/generate-event-icons.py oraz src/lib/map-event-icons.ts.
 */
export function eventMarkerIcon(
  category: string,
  subcategory: string | null | undefined,
): string {
  if (subcategory && SUBCATEGORY_EMOJI[subcategory]) return `evt-${subcategory}`;
  return `evt-${parseCategory(category)}`;
}

export function isEventCategory(value: unknown): value is EventCategory {
  return typeof value === 'string' && (EVENT_CATEGORIES as readonly string[]).includes(value);
}

export function parseCategory(value: unknown): EventCategory {
  return isEventCategory(value) ? value : 'inne';
}

export function categoryMeta(category: EventCategory): CategoryMeta {
  return CATEGORY_META[category] ?? CATEGORY_META.inne;
}

export function categoryLabel(category: string): string {
  const id = parseCategory(category);
  return t(`eventCategories.${id}` as TKey);
}

export function categoryColor(category: string): string {
  return isEventCategory(category) ? CATEGORY_META[category].color : CATEGORY_META.inne.color;
}

export function categoryEmoji(category: string): string {
  return isEventCategory(category) ? CATEGORY_META[category].emoji : CATEGORY_META.inne.emoji;
}

export function subcategoriesFor(category: EventCategory): SubcategoryMeta[] {
  return SUBCATEGORIES[category] ?? [];
}

export function subcategoryLabel(subcategory: string | null | undefined): string | null {
  if (!subcategory) return null;
  if (KNOWN_SUBCATEGORY_IDS.has(subcategory)) {
    return t(`subcategories.${subcategory}` as TKey);
  }
  return subcategory;
}
