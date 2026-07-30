import type { PickedMedia } from '@/lib/pick-image';
import { supabase } from '@/lib/supabase';

export type UploadedPostMedia = {
  path: string;
  media_type: 'image' | 'video';
  mime_type: string;
};

function extFor(media: PickedMedia): string {
  const m = media.mimeType.toLowerCase();
  if (media.mediaType === 'video') {
    if (m.includes('quicktime') || m.includes('mov')) return 'mov';
    if (m.includes('webm')) return 'webm';
    return 'mp4';
  }
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  return 'jpg';
}

/**
 * Wgrywa zdjęcia/filmy posta do bucketu `post-media`.
 * Ścieżka: {userId}/{losowy}.{ext} — wymagana przez RPC create_post (folder = userId).
 */
export async function uploadPostMedia(
  media: PickedMedia[],
): Promise<{ uploaded: UploadedPostMedia[]; error: string | null }> {
  if (media.length === 0) return { uploaded: [], error: null };

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { uploaded: [], error: 'not_authenticated' };

  const uploaded: UploadedPostMedia[] = [];

  for (const item of media) {
    const ext = extFor(item);
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const path = `${userId}/${fileName}`;

    try {
      const response = await fetch(item.uri);
      const blob = await response.blob();
      const { error: uploadError } = await supabase.storage
        .from('post-media')
        .upload(path, blob, { contentType: item.mimeType, upsert: true });

      if (uploadError) {
        return { uploaded, error: uploadError.message };
      }

      uploaded.push({ path, media_type: item.mediaType, mime_type: item.mimeType });
    } catch {
      return { uploaded, error: 'upload_failed' };
    }
  }

  return { uploaded, error: null };
}

/** Publiczny URL pliku z bucketu `post-media`. */
export function postMediaUrl(storagePath: string): string {
  const { data } = supabase.storage.from('post-media').getPublicUrl(storagePath);
  return data.publicUrl ?? '';
}
