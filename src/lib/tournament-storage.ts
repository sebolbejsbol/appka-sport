import { extensionForMime, uploadImageToBucket } from '@/lib/storage-upload';
import { supabase } from '@/lib/supabase';

export async function uploadTournamentLogo(
  tournamentId: string,
  uri: string,
  mimeType = 'image/jpeg',
  base64?: string | null,
): Promise<{ publicUrl: string | null; error: { message: string } | null }> {
  const ext = extensionForMime(mimeType);
  const path = `${tournamentId}/logo-${Date.now()}.${ext}`;

  const { error } = await uploadImageToBucket('tournament-logos', path, { uri, mimeType, base64 });
  if (error) {
    return { publicUrl: null, error };
  }

  const { data } = supabase.storage.from('tournament-logos').getPublicUrl(path);
  return { publicUrl: data.publicUrl ?? null, error: null };
}
