import { extensionForMime, uploadImageToBucket } from '@/lib/storage-upload';
import { supabase } from '@/lib/supabase';

export async function uploadTeamLogo(
  teamId: string,
  uri: string,
  mimeType = 'image/jpeg',
  base64?: string | null,
): Promise<{ publicUrl: string | null; error: { message: string } | null }> {
  const ext = extensionForMime(mimeType);
  // Sufiks czasowy wymusza odświeżenie cache po podmianie logo.
  const path = `${teamId}/logo-${Date.now()}.${ext}`;

  const { error } = await uploadImageToBucket('team-logos', path, { uri, mimeType, base64 });
  if (error) {
    return { publicUrl: null, error };
  }

  const { data } = supabase.storage.from('team-logos').getPublicUrl(path);
  return { publicUrl: data.publicUrl ?? null, error: null };
}
