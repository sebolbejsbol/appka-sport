import { extensionForMime, uploadImageToBucket } from '@/lib/storage-upload';
import { supabase } from '@/lib/supabase';

/** Wgrywa avatar użytkownika do bucketu `avatars` (ścieżka userId/avatar-<ts>.ext). */
export async function uploadAvatar(
  userId: string,
  uri: string,
  mimeType = 'image/jpeg',
  base64?: string | null,
): Promise<{ publicUrl: string | null; error: { message: string } | null }> {
  const ext = extensionForMime(mimeType);
  // Sufiks czasowy wymusza odświeżenie cache po podmianie zdjęcia.
  const path = `${userId}/avatar-${Date.now()}.${ext}`;

  const { error } = await uploadImageToBucket('avatars', path, { uri, mimeType, base64 });
  if (error) {
    return { publicUrl: null, error };
  }

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return { publicUrl: data.publicUrl ?? null, error: null };
}
