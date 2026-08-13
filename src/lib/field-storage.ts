import { extensionForMime, uploadImageToBucket } from '@/lib/storage-upload';
import { supabase } from '@/lib/supabase';

export async function uploadFieldPhoto(
  fieldId: string,
  uri: string,
  mimeType = 'image/jpeg',
  base64?: string | null,
): Promise<{ publicUrl: string | null; error: { message: string } | null }> {
  const ext = extensionForMime(mimeType);
  // Sufiks czasowy wymusza odświeżenie cache po podmianie zdjęcia.
  const path = `${fieldId}/photo-${Date.now()}.${ext}`;

  const { error } = await uploadImageToBucket('field-photos', path, { uri, mimeType, base64 });
  if (error) {
    return { publicUrl: null, error };
  }

  const { data } = supabase.storage.from('field-photos').getPublicUrl(path);
  return { publicUrl: data.publicUrl ?? null, error: null };
}
