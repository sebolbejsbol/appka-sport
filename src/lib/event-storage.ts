import { extensionForMime, uploadImageToBucket } from '@/lib/storage-upload';
import { supabase } from '@/lib/supabase';

/**
 * Wgrywa zdjęcie wydarzenia do bucketu `event-images`.
 * Ścieżka: {userId}/{losowy}.{ext} — zgodnie z polityką RLS (folder = userId).
 */
export async function uploadEventImage(
  userId: string,
  uri: string,
  mimeType = 'image/jpeg',
  base64?: string | null,
): Promise<{ publicUrl: string | null; error: { message: string } | null }> {
  const ext = extensionForMime(mimeType);
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const path = `${userId}/${fileName}`;

  const { error } = await uploadImageToBucket('event-images', path, { uri, mimeType, base64 });
  if (error) {
    return { publicUrl: null, error };
  }

  const { data } = supabase.storage.from('event-images').getPublicUrl(path);
  return { publicUrl: data.publicUrl ?? null, error: null };
}
