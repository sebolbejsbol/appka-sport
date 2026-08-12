import { supabase } from '@/lib/supabase';

export async function toggleFieldFavorite(
  fieldId: string,
): Promise<{ isFavorited: boolean | null; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('toggle_field_favorite', { p_field_id: fieldId });
  if (error) return { isFavorited: null, error };
  return { isFavorited: Boolean(data), error: null };
}

export async function listMyFavoriteFieldIds(): Promise<{
  data: string[];
  error: { message: string } | null;
}> {
  const { data, error } = await supabase.rpc('list_my_favorite_field_ids');
  if (error) return { data: [], error };
  return { data: ((data as string[] | null) ?? []).map(String), error: null };
}
