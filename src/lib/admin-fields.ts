import { supabase } from '@/lib/supabase';

export type AdminFieldStatus = 'pending' | 'rejected';

export type AdminFieldItem = {
  id: string;
  name: string | null;
  sport: string | null;
  status: string;
  source: string;
  lng: number;
  lat: number;
  created_at: string;
  user_note: string | null;
  submitted_by_nick: string | null;
  admin_note: string | null;
};

export type NearbyFieldItem = {
  id: string;
  name: string | null;
  sport: string | null;
  distance_m: number;
  lng: number;
  lat: number;
};

export type ModerateFieldResult = 'ok' | 'not_admin' | 'not_found' | 'invalid' | 'error';

export type ModerateFieldOptions = {
  name?: string | null;
  adminNote?: string | null;
};

function mapQueueRow(raw: Record<string, unknown>): AdminFieldItem {
  return {
    id: String(raw.id),
    name: raw.name != null ? String(raw.name) : null,
    sport: raw.sport != null ? String(raw.sport) : null,
    status: String(raw.status),
    source: String(raw.source ?? ''),
    lng: Number(raw.lng),
    lat: Number(raw.lat),
    created_at: String(raw.created_at),
    user_note: raw.user_note != null ? String(raw.user_note) : null,
    submitted_by_nick: raw.submitted_by_nick != null ? String(raw.submitted_by_nick) : null,
    admin_note: raw.admin_note != null ? String(raw.admin_note) : null,
  };
}

function mapNearbyRow(raw: Record<string, unknown>): NearbyFieldItem {
  return {
    id: String(raw.id),
    name: raw.name != null ? String(raw.name) : null,
    sport: raw.sport != null ? String(raw.sport) : null,
    distance_m: Number(raw.distance_m),
    lng: Number(raw.lng),
    lat: Number(raw.lat),
  };
}

export async function getAdminFieldsQueue(
  status: AdminFieldStatus = 'pending',
): Promise<{ data: AdminFieldItem[]; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('admin_fields_queue', {
    p_status: status,
    p_max_rows: 50,
  });

  if (error) return { data: [], error };
  return {
    data: ((data as Record<string, unknown>[] | null) ?? []).map(mapQueueRow),
    error: null,
  };
}

export async function getAdminNearbyFields(
  fieldId: string,
): Promise<{ data: NearbyFieldItem[]; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('admin_nearby_fields', {
    p_field_id: fieldId,
    p_radius_m: 80,
    p_max_rows: 5,
  });

  if (error) return { data: [], error };
  return {
    data: ((data as Record<string, unknown>[] | null) ?? []).map(mapNearbyRow),
    error: null,
  };
}

export async function moderateField(
  fieldId: string,
  status: 'approved' | 'rejected',
  options: ModerateFieldOptions = {},
): Promise<ModerateFieldResult> {
  const { error } = await supabase.rpc('moderate_field', {
    p_field_id: fieldId,
    p_status: status,
    p_name: options.name?.trim() || null,
    p_admin_note: options.adminNote?.trim() || null,
  });

  if (!error) return 'ok';

  const msg = error.message ?? '';
  if (msg.includes('not_admin')) return 'not_admin';
  if (msg.includes('field_not_found')) return 'not_found';
  if (msg.includes('invalid_name') || msg.includes('invalid_admin_note')) return 'invalid';
  return 'error';
}
