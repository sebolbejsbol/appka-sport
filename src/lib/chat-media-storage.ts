import type { ChatMediaType, OutgoingAttachment } from '@/lib/messages';
import { supabase } from '@/lib/supabase';

const BUCKET = 'chat-media';

/** Limity rozmiaru (zgodne z walidacją w RPC send_message_v2). */
export const CHAT_MEDIA_LIMITS: Record<ChatMediaType, number> = {
  image: 10 * 1024 * 1024,
  video: 100 * 1024 * 1024,
  audio: 25 * 1024 * 1024,
  file: 25 * 1024 * 1024,
};

/** Plik wybrany przez użytkownika, gotowy do wgrania (po ewentualnej kompresji). */
export type PickedChatFile = {
  uri: string;
  mediaType: ChatMediaType;
  mimeType: string;
  fileName?: string | null;
  sizeBytes?: number | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  /** Lokalny URI miniatury (np. dla wideo) — wgrywany osobno. */
  thumbnailUri?: string | null;
};

function extFromMime(mime: string, fallback: string): string {
  const m = mime.toLowerCase();
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  if (m.includes('quicktime') || m.includes('mov')) return 'mov';
  if (m.includes('mp4')) return 'mp4';
  if (m.includes('webm')) return 'webm';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('wav')) return 'wav';
  if (m.includes('m4a') || m.includes('aac')) return 'm4a';
  if (m.includes('pdf')) return 'pdf';
  const fromName = fallback.split('.').pop();
  return fromName && fromName.length <= 5 ? fromName : 'bin';
}

async function uploadSingle(
  userId: string,
  uri: string,
  mime: string,
  hintName: string,
): Promise<{ path: string; size: number } | { error: string }> {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    const ext = extFromMime(mime, hintName);
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, { contentType: mime, upsert: true });
    if (error) return { error: error.message };
    return { path, size: blob.size };
  } catch {
    return { error: 'upload_failed' };
  }
}

/**
 * Wgrywa wybrane pliki do bucketu `chat-media` i zwraca metadane gotowe
 * do przekazania do `sendMessageV2`. Waliduje limity rozmiaru lokalnie.
 */
export async function uploadChatMedia(
  files: PickedChatFile[],
): Promise<{ attachments: OutgoingAttachment[]; error: string | null }> {
  if (files.length === 0) return { attachments: [], error: null };

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { attachments: [], error: 'not_authenticated' };

  const attachments: OutgoingAttachment[] = [];

  for (const file of files) {
    const limit = CHAT_MEDIA_LIMITS[file.mediaType];
    if (file.sizeBytes && file.sizeBytes > limit) {
      return { attachments, error: 'file_too_large' };
    }

    const main = await uploadSingle(userId, file.uri, file.mimeType, file.fileName ?? '');
    if ('error' in main) return { attachments, error: main.error };
    if (main.size > limit) return { attachments, error: 'file_too_large' };

    let thumbnailPath: string | null = null;
    if (file.thumbnailUri) {
      const thumb = await uploadSingle(userId, file.thumbnailUri, 'image/jpeg', 'thumb.jpg');
      if (!('error' in thumb)) thumbnailPath = thumb.path;
    }

    attachments.push({
      media_type: file.mediaType,
      storage_path: main.path,
      mime_type: file.mimeType,
      size_bytes: file.sizeBytes ?? main.size,
      width: file.width ?? null,
      height: file.height ?? null,
      duration_ms: file.durationMs ?? null,
      file_name: file.fileName ?? null,
      thumbnail_path: thumbnailPath,
    });
  }

  return { attachments, error: null };
}

/** Publiczny URL pliku z bucketu `chat-media`. */
export function chatMediaUrl(storagePath: string | null | undefined): string {
  if (!storagePath) return '';
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return data.publicUrl ?? '';
}
