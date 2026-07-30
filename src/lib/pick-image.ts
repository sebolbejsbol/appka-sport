export type PickedImage = {
  uri: string;
  mimeType: string;
  /** Zawartość pliku w base64 — najpewniejszy sposób uploadu do Supabase w React Native. */
  base64?: string | null;
};

export type PickedMedia = {
  uri: string;
  mimeType: string;
  mediaType: 'image' | 'video';
};

/** Wybór zdjęć i/lub filmów do posta (Aktualności). Maks. `selectionLimit`. */
export async function pickPostMedia(selectionLimit = 4): Promise<PickedMedia[]> {
  try {
    const ImagePicker = await import('expo-image-picker');
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      return [];
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.85,
      allowsMultipleSelection: true,
      selectionLimit,
      videoMaxDuration: 120,
    });

    if (result.canceled) {
      return [];
    }

    return result.assets.map((asset) => {
      const isVideo =
        asset.type === 'video' || (asset.mimeType?.startsWith('video') ?? false);
      return {
        uri: asset.uri,
        mimeType: asset.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg'),
        mediaType: isVideo ? ('video' as const) : ('image' as const),
      };
    });
  } catch {
    return [];
  }
}

export type PickedChatMedia = {
  uri: string;
  mediaType: 'image' | 'video';
  mimeType: string;
  fileName: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
};

/** Wybór zdjęć/filmów do czatu (z kompresją zdjęć przez `quality`). */
export async function pickChatMedia(selectionLimit = 6): Promise<PickedChatMedia[]> {
  try {
    const ImagePicker = await import('expo-image-picker');
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return [];

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit,
      videoMaxDuration: 180,
    });

    if (result.canceled) return [];

    return result.assets.map((asset) => {
      const isVideo =
        asset.type === 'video' || (asset.mimeType?.startsWith('video') ?? false);
      return {
        uri: asset.uri,
        mediaType: isVideo ? ('video' as const) : ('image' as const),
        mimeType: asset.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg'),
        fileName: asset.fileName ?? null,
        sizeBytes: typeof asset.fileSize === 'number' ? asset.fileSize : null,
        width: typeof asset.width === 'number' ? asset.width : null,
        height: typeof asset.height === 'number' ? asset.height : null,
        durationMs: typeof asset.duration === 'number' ? asset.duration : null,
      };
    });
  } catch {
    return [];
  }
}

export type PickImageOptions = {
  /** Proporcje kadrowania, domyślnie kwadrat 1:1. */
  aspect?: [number, number];
};

/** Wybór zdjęcia z galerii — lazy import, żeby ekran działał bez natywnego modułu. */
export async function pickImageFromLibrary(
  options: PickImageOptions = {},
): Promise<PickedImage | null> {
  try {
    const ImagePicker = await import('expo-image-picker');
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: true,
      aspect: options.aspect ?? [1, 1],
      base64: true,
    });

    if (result.canceled || !result.assets[0]) {
      return null;
    }

    return {
      uri: result.assets[0].uri,
      mimeType: result.assets[0].mimeType ?? 'image/jpeg',
      base64: result.assets[0].base64 ?? null,
    };
  } catch {
    return null;
  }
}

/** Wybór wielu zdjęć naraz (galeria wydarzenia). */
export async function pickImagesFromLibrary(selectionLimit = 8): Promise<PickedImage[]> {
  try {
    const ImagePicker = await import('expo-image-picker');
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      return [];
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsMultipleSelection: true,
      selectionLimit,
      base64: true,
    });

    if (result.canceled) {
      return [];
    }

    return result.assets.map((asset) => ({
      uri: asset.uri,
      mimeType: asset.mimeType ?? 'image/jpeg',
      base64: asset.base64 ?? null,
    }));
  } catch {
    return [];
  }
}
