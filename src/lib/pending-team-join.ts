import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'pendingTeamJoinCode';

/** Wyciąga kod z URL w kształcie .../join-team/<code>, jeśli tam jest. */
export function extractJoinCodeFromUrl(url: string): string | null {
  const match = url.match(/join-team\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

/** Zapamiętuje kod zaproszenia z linku otwartego zanim ktoś był zalogowany —
 * odczytujemy go ponownie, gdy sesja się pojawi (po zalogowaniu/rejestracji). */
export async function savePendingJoinCode(code: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, code);
}

export async function consumePendingJoinCode(): Promise<string | null> {
  const code = await AsyncStorage.getItem(STORAGE_KEY);
  if (code) await AsyncStorage.removeItem(STORAGE_KEY);
  return code;
}
