import { supabase } from '@/lib/supabase';

export type PendingFieldRatingEvent = {
  event_id: string;
  field_id: string;
  field_name: string | null;
  title: string | null;
  starts_at: string;
  ends_at: string;
};

export async function getMyEventsPendingFieldRating(
  limit = 10,
): Promise<{ data: PendingFieldRatingEvent[]; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('my_events_pending_field_rating', {
    p_limit: limit,
  });

  const rows = (data as Record<string, unknown>[] | null) ?? [];
  return {
    data: rows.map((row) => ({
      event_id: String(row.event_id ?? ''),
      field_id: String(row.field_id ?? ''),
      field_name: typeof row.field_name === 'string' ? row.field_name : null,
      title: typeof row.title === 'string' ? row.title : null,
      starts_at: String(row.starts_at ?? ''),
      ends_at: String(row.ends_at ?? ''),
    })),
    error,
  };
}
