import { supabase } from '@/lib/supabase';

export type SubmitFieldResult =
  | { ok: true; fieldId: string }
  | {
      ok: false;
      reason:
        | 'too_close'
        | 'invalid_input'
        | 'rate_limit'
        | 'not_authenticated'
        | 'migration_missing'
        | 'error';
      detail?: string;
    };

function mapSubmitError(message: string, code?: string): SubmitFieldResult {
  const msg = message.toLowerCase();

  if (code === 'PGRST202' || msg.includes('submit_field_report') || msg.includes('schema cache')) {
    return { ok: false, reason: 'migration_missing', detail: message };
  }
  if (msg.includes('too_close')) return { ok: false, reason: 'too_close' };
  if (msg.includes('rate_limit')) return { ok: false, reason: 'rate_limit' };
  if (msg.includes('not_authenticated')) return { ok: false, reason: 'not_authenticated' };
  if (
    msg.includes('invalid_name') ||
    msg.includes('invalid_note') ||
    msg.includes('invalid_coords')
  ) {
    return { ok: false, reason: 'invalid_input' };
  }
  if (msg.includes('submitted_by') || msg.includes('user_note')) {
    return { ok: false, reason: 'migration_missing', detail: message };
  }

  return { ok: false, reason: 'error', detail: message };
}

export async function submitFieldReport(input: {
  lng: number;
  lat: number;
  name: string;
  note?: string;
  sport?: string;
}): Promise<SubmitFieldResult> {
  const params: {
    p_lng: number;
    p_lat: number;
    p_name: string;
    p_sport: string;
    p_note?: string;
  } = {
    p_lng: input.lng,
    p_lat: input.lat,
    p_name: input.name.trim(),
    p_sport: input.sport ?? 'basketball',
  };

  const trimmedNote = input.note?.trim();
  if (trimmedNote) params.p_note = trimmedNote;

  const { data, error } = await supabase.rpc('submit_field_report', params);

  if (!error) {
    const fieldId = data == null ? '' : String(data).trim();
    if (fieldId) return { ok: true, fieldId };
    return { ok: false, reason: 'error', detail: 'empty_response' };
  }

  return mapSubmitError(error.message ?? '', error.code);
}
