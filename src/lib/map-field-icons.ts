import type { ImageEntry } from '@rnmapbox/maps';

/** @3x — ostre znaczniki (generowane: scripts/generate-map-field-icons.py). */
const FIELD_ICON_SCALE = 3;

function icon(moduleId: number): ImageEntry {
  return { image: moduleId, scale: FIELD_ICON_SCALE };
}

/**
 * Gotowe znaczniki obiektów (kolorowa kropka + wypalone emoji). Klucze muszą
 * pasować do fieldMarkerIcon() w src/lib/sports.ts.
 */
export const mapFieldIcons = {
  basketball: icon(require('../../assets/map-field-icons/basketball.png')),
  football: icon(require('../../assets/map-field-icons/football.png')),
  tennis: icon(require('../../assets/map-field-icons/tennis.png')),
  volleyball: icon(require('../../assets/map-field-icons/volleyball.png')),
  running: icon(require('../../assets/map-field-icons/running.png')),
  swimming: icon(require('../../assets/map-field-icons/swimming.png')),
  climbing: icon(require('../../assets/map-field-icons/climbing.png')),
  skatepark: icon(require('../../assets/map-field-icons/skatepark.png')),
  fitness: icon(require('../../assets/map-field-icons/fitness.png')),
  outdoor_gym: icon(require('../../assets/map-field-icons/outdoor_gym.png')),
  music_club: icon(require('../../assets/map-field-icons/music_club.png')),
  multi: icon(require('../../assets/map-field-icons/multi.png')),
  generic: icon(require('../../assets/map-field-icons/generic.png')),
  handball: icon(require('../../assets/map-field-icons/handball.png')),
  badminton: icon(require('../../assets/map-field-icons/badminton.png')),
  padel: icon(require('../../assets/map-field-icons/padel.png')),
  arts_centre: icon(require('../../assets/map-field-icons/arts_centre.png')),
  photo_studio: icon(require('../../assets/map-field-icons/photo_studio.png')),
  pottery: icon(require('../../assets/map-field-icons/pottery.png')),
  cooking_school: icon(require('../../assets/map-field-icons/cooking_school.png')),
  chess: icon(require('../../assets/map-field-icons/chess.png')),
  park: icon(require('../../assets/map-field-icons/park.png')),
  museum: icon(require('../../assets/map-field-icons/museum.png')),
  theatre: icon(require('../../assets/map-field-icons/theatre.png')),
  cinema: icon(require('../../assets/map-field-icons/cinema.png')),
  library: icon(require('../../assets/map-field-icons/library.png')),
  concert_hall: icon(require('../../assets/map-field-icons/concert_hall.png')),
  community_centre: icon(require('../../assets/map-field-icons/community_centre.png')),
  coworking: icon(require('../../assets/map-field-icons/coworking.png')),
  conference_centre: icon(require('../../assets/map-field-icons/conference_centre.png')),
} as const;
