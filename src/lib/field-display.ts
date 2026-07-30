import { t } from '@/i18n';
import { formatSportLabel } from '@/lib/sports';

export function formatFieldSport(sport?: string | null): string {
  return formatSportLabel(sport ?? 'basketball');
}

/**
 * Domyślna nazwa boiska zależna od dyscypliny — żeby kort tenisowy nie był
 * podpisany jako „Boisko do koszykówki”. Obsługuje listy „a;b” (wielofunkcyjne).
 */
export function defaultCourtNameForSport(sport?: string | null): string {
  const s = sport?.trim().toLowerCase();
  if (!s) return t('field.courtNames.generic');
  if (s.includes(';')) return t('field.courtNames.multi');
  switch (s) {
    case 'basketball':
      return t('field.courtNames.basketball');
    case 'football':
    case 'soccer':
      return t('field.courtNames.football');
    case 'tennis':
      return t('field.courtNames.tennis');
    case 'volleyball':
    case 'beachvolleyball':
      return t('field.courtNames.volleyball');
    case 'handball':
      return t('field.courtNames.handball');
    case 'running':
    case 'athletics':
      return t('field.courtNames.running');
    case 'swimming':
      return t('field.courtNames.swimming');
    case 'climbing':
      return t('field.courtNames.climbing');
    case 'skatepark':
    case 'skateboard':
      return t('field.courtNames.skatepark');
    case 'fitness':
      return t('field.courtNames.fitness');
    case 'outdoor_gym':
      return t('field.courtNames.outdoor_gym');
    case 'music_club':
      return t('field.courtNames.music_club');
    case 'badminton':
      return t('field.courtNames.badminton');
    case 'padel':
      return t('field.courtNames.padel');
    case 'arts_centre':
      return t('field.courtNames.arts_centre');
    case 'photo_studio':
      return t('field.courtNames.photo_studio');
    case 'pottery':
      return t('field.courtNames.pottery');
    case 'cooking_school':
      return t('field.courtNames.cooking_school');
    case 'chess':
      return t('field.courtNames.chess');
    case 'park':
      return t('field.courtNames.park');
    case 'museum':
      return t('field.courtNames.museum');
    case 'theatre':
      return t('field.courtNames.theatre');
    case 'cinema':
      return t('field.courtNames.cinema');
    case 'library':
      return t('field.courtNames.library');
    case 'concert_hall':
      return t('field.courtNames.concert_hall');
    case 'community_centre':
      return t('field.courtNames.community_centre');
    case 'coworking':
      return t('field.courtNames.coworking');
    case 'conference_centre':
      return t('field.courtNames.conference_centre');
    case 'multi':
      return t('field.courtNames.multi');
    default:
      return t('field.courtNames.generic');
  }
}

/** Czy tekst wygląda jak adres/ulica (a nie nazwa obiektu). */
function isStreetLike(value: string): boolean {
  return /^(ul\.|ulica|al\.|aleja|os\.|osiedle|pl\.|plac|rondo)\s/i.test(value.trim());
}

export function formatStreetLabel(street: string): string {
  const trimmed = street.trim();
  if (isStreetLike(trimmed)) return trimmed;
  return `ul. ${trimmed}`;
}

/** Wyciąga nazwę boiska i ulicę z pola name (np. po imporcie OSM). */
export function parseStoredFieldName(name: string | null | undefined): {
  court: string | null;
  street: string | null;
} {
  if (!name?.trim()) return { court: null, street: null };

  const parts = name.split(' · ');
  if (parts.length >= 2) {
    const streetPart = parts[parts.length - 1]?.trim();
    const courtPart = parts.slice(0, -1).join(' · ').trim();
    if (streetPart && isStreetLike(streetPart)) {
      return { court: courtPart || null, street: streetPart };
    }
  }

  // Sama ulica (bez nazwy obiektu) → nazwę boiska wyliczamy z dyscypliny.
  if (isStreetLike(name.trim())) {
    return { court: null, street: name.trim() };
  }

  return { court: name.trim(), street: null };
}

export function formatCourtName(osmName?: string | null, sport?: string | null): string {
  const { court } = parseStoredFieldName(osmName);
  return court || defaultCourtNameForSport(sport);
}

/**
 * Tytuł boiska: nazwa boiska + ulica, np.
 * „Boisko do koszykówki · ul. Madalińskiego”.
 */
export function formatFieldTitle(opts: {
  street?: string | null;
  osmName?: string | null;
  sport?: string | null;
}): string {
  const stored = parseStoredFieldName(opts.osmName);
  const court = stored.court || defaultCourtNameForSport(opts.sport);
  const street = opts.street?.trim() || stored.street;
  if (street) return `${court} · ${formatStreetLabel(street)}`;
  return court;
}

/** Buduje nazwę do zapisu w bazie z tagów OSM (import). */
export function buildFieldNameFromOsmTags(tags: Record<string, string>): string {
  const street =
    tags['addr:street']?.trim() ||
    tags['addr:place']?.trim() ||
    tags['addr:full']?.trim() ||
    null;
  const osmName = tags.name?.trim() || null;

  return formatFieldTitle({ street, osmName });
}
