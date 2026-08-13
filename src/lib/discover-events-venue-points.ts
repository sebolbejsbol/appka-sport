import { courtAvailability, type CourtAvailability } from '@/lib/court-availability';
import type { DiscoverEvent } from '@/lib/discover-events';

export type EventVenuePoint = {
  id: string;
  lng: number;
  lat: number;
  /** Dominujący sport wśród eventów w tym punkcie (do ikony) — null gdy żaden event go nie ma. */
  sport: string | null;
  eventCount: number;
  availability: CourtAvailability;
};

/** Klucz grupowania: prawdziwe boisko (field_id) albo, dla eventów bez przypisanego obiektu, sam event. */
export function venueKeyForEvent(event: Pick<DiscoverEvent, 'id' | 'field_id'>): string {
  return event.field_id ?? `event:${event.id}`;
}

export type GroupedEventVenues = {
  points: EventVenuePoint[];
  /** Surowe eventy per punkt (klucz = venueKeyForEvent), do rozwiązania "który event otworzyć" po tapnięciu. */
  eventsByVenue: Map<string, DiscoverEvent[]>;
};

/**
 * Grupuje przefiltrowaną listę eventów (zakładka Eventy) po boisku (field_id),
 * żeby mapa pokazywała JEDEN punkt na obiekt — z licznikiem, statusem i ikoną
 * dominującego sportu — zamiast osobnej pinezki na każdy event. Event to dane
 * zasilające wygląd obiektu, nie osobny marker na mapie.
 *
 * Eventy bez field_id (własna lokalizacja, nie przypisana do zarejestrowanego
 * boiska) też muszą przejść przez ten sam pipeline — dostają syntetyczny klucz
 * (patrz venueKeyForEvent), więc renderują się jako pojedynczy, izolowany punkt
 * w TYM SAMYM stylu co reszta, zamiast być pomijane albo renderowane osobno.
 */
export function groupEventsByVenue(events: DiscoverEvent[]): GroupedEventVenues {
  const eventsByVenue = new Map<string, DiscoverEvent[]>();
  for (const event of events) {
    if (event.lng == null || event.lat == null) continue;
    const key = venueKeyForEvent(event);
    const list = eventsByVenue.get(key);
    if (list) {
      list.push(event);
    } else {
      eventsByVenue.set(key, [event]);
    }
  }

  const points: EventVenuePoint[] = [];
  for (const [id, group] of eventsByVenue) {
    const first = group[0];
    points.push({
      id,
      lng: first.lng as number,
      lat: first.lat as number,
      sport: dominantSport(group),
      eventCount: group.length,
      availability: bestAvailability(group),
    });
  }
  return { points, eventsByVenue };
}

/** Event, który ma się otworzyć po tapnięciu punktu — najbliższy nadchodzący w grupie. */
export function soonestEvent(events: DiscoverEvent[]): DiscoverEvent | null {
  if (events.length === 0) return null;
  return [...events].sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
}

function dominantSport(events: DiscoverEvent[]): string | null {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (!event.sport) continue;
    counts.set(event.sport, (counts.get(event.sport) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [sport, count] of counts) {
    if (count > bestCount) {
      best = sport;
      bestCount = count;
    }
  }
  return best;
}

const AVAILABILITY_RANK: Record<CourtAvailability, number> = { open: 3, filling: 2, full: 1, empty: 0 };

/** Najlepszy (najbardziej "warto zajrzeć") status wśród eventów w punkcie — ten sam priorytet co gdzie indziej: open > filling > full > empty. */
function bestAvailability(events: DiscoverEvent[]): CourtAvailability {
  let best: CourtAvailability = 'empty';
  for (const event of events) {
    const status = courtAvailability(event.participant_count, event.max_players);
    if (AVAILABILITY_RANK[status] > AVAILABILITY_RANK[best]) best = status;
  }
  return best;
}
