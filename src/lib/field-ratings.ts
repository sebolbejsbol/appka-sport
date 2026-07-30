import { supabase } from '@/lib/supabase';

export type FieldRatingDimension =
  | 'surface'
  | 'lighting'
  | 'cleanliness'
  | 'accessibility'
  | 'safety';

export const FIELD_RATING_DIMENSIONS: FieldRatingDimension[] = [
  'surface',
  'lighting',
  'cleanliness',
  'accessibility',
  'safety',
];

export type FieldRatingScores = Record<FieldRatingDimension, number>;

export type FieldRatingSummary = {
  rating_count: number;
  avg_rating: number | null;
  surface_avg: number | null;
  lighting_avg: number | null;
  cleanliness_avg: number | null;
  accessibility_avg: number | null;
  safety_avg: number | null;
};

export type FieldRatingReview = {
  id: string;
  user_id: string;
  nick: string | null;
  event_starts_at: string | null;
  surface_score: number;
  lighting_score: number;
  cleanliness_score: number;
  accessibility_score: number;
  safety_score: number;
  overall_score: number;
  comment: string | null;
  created_at: string;
};

export type EventFieldRating = {
  surface_score: number;
  lighting_score: number;
  cleanliness_score: number;
  accessibility_score: number;
  safety_score: number;
  comment: string | null;
};

export type SubmitFieldRatingError =
  | 'not_authenticated'
  | 'invalid_event'
  | 'not_rateable'
  | 'invalid_score'
  | 'invalid_comment'
  | 'unknown';

export type SubmitFieldRatingResult =
  | { ok: true; id: string }
  | { ok: false; error: SubmitFieldRatingError };

function parseErrorCode(message: string | undefined): SubmitFieldRatingError {
  const code = message?.match(/^([a-z_]+)/)?.[1];
  if (
    code === 'not_authenticated' ||
    code === 'invalid_event' ||
    code === 'not_rateable' ||
    code === 'invalid_score' ||
    code === 'invalid_comment'
  ) {
    return code;
  }
  return 'unknown';
}

export async function getFieldRatingSummary(
  fieldId: string,
): Promise<{ data: FieldRatingSummary | null; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('field_rating_summary', {
    p_field_id: fieldId,
  });

  if (error) return { data: null, error };

  const row = (data as Record<string, unknown>[] | null)?.[0];
  if (!row) {
    return {
      data: {
        rating_count: 0,
        avg_rating: null,
        surface_avg: null,
        lighting_avg: null,
        cleanliness_avg: null,
        accessibility_avg: null,
        safety_avg: null,
      },
      error: null,
    };
  }

  return {
    data: {
      rating_count: Number(row.rating_count) || 0,
      avg_rating: row.avg_rating != null ? Number(row.avg_rating) : null,
      surface_avg: row.surface_avg != null ? Number(row.surface_avg) : null,
      lighting_avg: row.lighting_avg != null ? Number(row.lighting_avg) : null,
      cleanliness_avg: row.cleanliness_avg != null ? Number(row.cleanliness_avg) : null,
      accessibility_avg: row.accessibility_avg != null ? Number(row.accessibility_avg) : null,
      safety_avg: row.safety_avg != null ? Number(row.safety_avg) : null,
    },
    error: null,
  };
}

export async function listFieldRatings(
  fieldId: string,
  limit = 30,
): Promise<{ data: FieldRatingReview[]; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('list_field_ratings', {
    p_field_id: fieldId,
    p_limit: limit,
  });

  return { data: (data as FieldRatingReview[] | null) ?? [], error };
}

export async function submitFieldRating(
  eventId: string,
  scores: FieldRatingScores,
  comment?: string | null,
): Promise<SubmitFieldRatingResult> {
  const { data, error } = await supabase.rpc('submit_field_rating', {
    p_event_id: eventId,
    p_surface_score: scores.surface,
    p_lighting_score: scores.lighting,
    p_cleanliness_score: scores.cleanliness,
    p_accessibility_score: scores.accessibility,
    p_safety_score: scores.safety,
    p_comment: comment ?? null,
  });

  if (error) {
    return { ok: false, error: parseErrorCode(error.message) };
  }

  return { ok: true, id: String(data) };
}

export function overallFromScores(scores: FieldRatingScores): number {
  const sum =
    scores.surface +
    scores.lighting +
    scores.cleanliness +
    scores.accessibility +
    scores.safety;
  return Math.round((sum / 5) * 10) / 10;
}

export function emptyFieldRatingScores(): FieldRatingScores {
  return {
    surface: 0,
    lighting: 0,
    cleanliness: 0,
    accessibility: 0,
    safety: 0,
  };
}

export function isFieldRatingComplete(scores: FieldRatingScores): boolean {
  return FIELD_RATING_DIMENSIONS.every((key) => scores[key] >= 1 && scores[key] <= 5);
}

export function parseEventFieldRating(raw: unknown): EventFieldRating | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const surface = Number(row.surface_score);
  const lighting = Number(row.lighting_score);
  const cleanliness = Number(row.cleanliness_score);
  const accessibility = Number(row.accessibility_score);
  const safety = Number(row.safety_score);
  if ([surface, lighting, cleanliness, accessibility, safety].some((n) => n < 1 || n > 5)) {
    return null;
  }
  return {
    surface_score: surface,
    lighting_score: lighting,
    cleanliness_score: cleanliness,
    accessibility_score: accessibility,
    safety_score: safety,
    comment: typeof row.comment === 'string' ? row.comment : null,
  };
}
