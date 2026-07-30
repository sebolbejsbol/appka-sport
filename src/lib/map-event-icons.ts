import type { ImageEntry } from '@rnmapbox/maps';

/** @3x — generowane: scripts/generate-event-icons.py. NIE EDYTUJ RĘCZNIE. */
const EVENT_ICON_SCALE = 3;

function icon(moduleId: number): ImageEntry {
  return { image: moduleId, scale: EVENT_ICON_SCALE };
}

/** Znaczniki wydarzeń (kolor kategorii + wypalone emoji podkategorii). */
export const mapEventIcons = {
  'evt-author_meeting': icon(require('../../assets/map-event-icons/evt-author_meeting.png')),
  'evt-badminton': icon(require('../../assets/map-event-icons/evt-badminton.png')),
  'evt-basketball': icon(require('../../assets/map-event-icons/evt-basketball.png')),
  'evt-biznes': icon(require('../../assets/map-event-icons/evt-biznes.png')),
  'evt-ceramics': icon(require('../../assets/map-event-icons/evt-ceramics.png')),
  'evt-chess': icon(require('../../assets/map-event-icons/evt-chess.png')),
  'evt-cinema': icon(require('../../assets/map-event-icons/evt-cinema.png')),
  'evt-climbing': icon(require('../../assets/map-event-icons/evt-climbing.png')),
  'evt-concert': icon(require('../../assets/map-event-icons/evt-concert.png')),
  'evt-conference': icon(require('../../assets/map-event-icons/evt-conference.png')),
  'evt-cooking': icon(require('../../assets/map-event-icons/evt-cooking.png')),
  'evt-course': icon(require('../../assets/map-event-icons/evt-course.png')),
  'evt-crafts': icon(require('../../assets/map-event-icons/evt-crafts.png')),
  'evt-cycling': icon(require('../../assets/map-event-icons/evt-cycling.png')),
  'evt-dj_set': icon(require('../../assets/map-event-icons/evt-dj_set.png')),
  'evt-drawing': icon(require('../../assets/map-event-icons/evt-drawing.png')),
  'evt-edukacja': icon(require('../../assets/map-event-icons/evt-edukacja.png')),
  'evt-exhibition': icon(require('../../assets/map-event-icons/evt-exhibition.png')),
  'evt-fair': icon(require('../../assets/map-event-icons/evt-fair.png')),
  'evt-festival': icon(require('../../assets/map-event-icons/evt-festival.png')),
  'evt-fitness': icon(require('../../assets/map-event-icons/evt-fitness.png')),
  'evt-football': icon(require('../../assets/map-event-icons/evt-football.png')),
  'evt-handball': icon(require('../../assets/map-event-icons/evt-handball.png')),
  'evt-hobby': icon(require('../../assets/map-event-icons/evt-hobby.png')),
  'evt-inne': icon(require('../../assets/map-event-icons/evt-inne.png')),
  'evt-jam_session': icon(require('../../assets/map-event-icons/evt-jam_session.png')),
  'evt-kultura': icon(require('../../assets/map-event-icons/evt-kultura.png')),
  'evt-lecture': icon(require('../../assets/map-event-icons/evt-lecture.png')),
  'evt-meetup': icon(require('../../assets/map-event-icons/evt-meetup.png')),
  'evt-music_club': icon(require('../../assets/map-event-icons/evt-music_club.png')),
  'evt-muzyka': icon(require('../../assets/map-event-icons/evt-muzyka.png')),
  'evt-networking': icon(require('../../assets/map-event-icons/evt-networking.png')),
  'evt-outdoor': icon(require('../../assets/map-event-icons/evt-outdoor.png')),
  'evt-outdoor_gym': icon(require('../../assets/map-event-icons/evt-outdoor_gym.png')),
  'evt-padel': icon(require('../../assets/map-event-icons/evt-padel.png')),
  'evt-painting': icon(require('../../assets/map-event-icons/evt-painting.png')),
  'evt-photography': icon(require('../../assets/map-event-icons/evt-photography.png')),
  'evt-rekreacja': icon(require('../../assets/map-event-icons/evt-rekreacja.png')),
  'evt-running': icon(require('../../assets/map-event-icons/evt-running.png')),
  'evt-skatepark': icon(require('../../assets/map-event-icons/evt-skatepark.png')),
  'evt-sport': icon(require('../../assets/map-event-icons/evt-sport.png')),
  'evt-swimming': icon(require('../../assets/map-event-icons/evt-swimming.png')),
  'evt-tennis': icon(require('../../assets/map-event-icons/evt-tennis.png')),
  'evt-theatre': icon(require('../../assets/map-event-icons/evt-theatre.png')),
  'evt-training': icon(require('../../assets/map-event-icons/evt-training.png')),
  'evt-volleyball': icon(require('../../assets/map-event-icons/evt-volleyball.png')),
  'evt-walk': icon(require('../../assets/map-event-icons/evt-walk.png')),
  'evt-workshop': icon(require('../../assets/map-event-icons/evt-workshop.png')),
  'evt-yoga': icon(require('../../assets/map-event-icons/evt-yoga.png')),
} as const;
