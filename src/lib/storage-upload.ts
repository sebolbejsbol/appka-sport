import { supabase } from '@/lib/supabase';

/**
 * Dekoduje base64 na bajty. W React Native `atob` jest dostępne globalnie (Hermes),
 * ale dla pewności mamy własny fallback dekodera.
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const clean = base64.includes(',') ? base64.split(',')[1] : base64;

  const binary =
    typeof globalThis.atob === 'function'
      ? globalThis.atob(clean)
      : decodeBase64Fallback(clean);

  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeBase64Fallback(input: string): string {
  let str = input.replace(/=+$/, '');
  let output = '';
  for (let bc = 0, bs = 0, buffer, i = 0; (buffer = str.charAt(i++)); ) {
    const idx = B64_CHARS.indexOf(buffer);
    if (idx === -1) continue;
    bs = bc % 4 ? bs * 64 + idx : idx;
    if (bc++ % 4) {
      output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
    }
  }
  return output;
}

export function extensionForMime(mimeType: string): string {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  return 'jpg';
}

type ImageSource = {
  uri: string;
  base64?: string | null;
  mimeType: string;
};

/**
 * Wgrywa obraz do bucketu Supabase w sposób odporny na środowisko React Native.
 *
 * Problem: `fetch(uri).blob()` na Hermes/RN często daje pusty (0-bajtowy) plik,
 * przez co zdjęcia „zapisują się", ale się nie wyświetlają. Dlatego preferujemy
 * base64 z image-pickera zdekodowany do bajtów; fallback to ArrayBuffer z fetch.
 */
export async function uploadImageToBucket(
  bucket: string,
  path: string,
  source: ImageSource,
): Promise<{ error: { message: string } | null }> {
  try {
    let body: Uint8Array | ArrayBuffer;

    if (source.base64 && source.base64.length > 0) {
      body = base64ToUint8Array(source.base64);
    } else {
      body = await fetch(source.uri).then((res) => res.arrayBuffer());
    }

    if (!body || (body as ArrayBuffer).byteLength === 0) {
      return { error: { message: 'empty_file' } };
    }

    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, body, { contentType: source.mimeType, upsert: true });

    return { error: error ? { message: error.message } : null };
  } catch (err) {
    return { error: { message: err instanceof Error ? err.message : 'upload_failed' } };
  }
}
