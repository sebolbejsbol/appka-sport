import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = '@field_rating_prompt_handled:';

export async function wasFieldRatingPromptHandled(eventId: string): Promise<boolean> {
  const value = await AsyncStorage.getItem(`${PREFIX}${eventId}`);
  return value === '1';
}

export async function markFieldRatingPromptHandled(eventId: string): Promise<void> {
  await AsyncStorage.setItem(`${PREFIX}${eventId}`, '1');
}

/** Okno na ocenę: do 90 min po planowanym końcu eventu. */
export function isWithinFieldRatingPromptWindow(endsAt: string): boolean {
  const endMs = new Date(endsAt).getTime();
  if (!Number.isFinite(endMs)) return false;
  const now = Date.now();
  return now >= endMs && now - endMs <= 90 * 60 * 1000;
}
