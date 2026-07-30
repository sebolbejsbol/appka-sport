import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@appka-sport/disclaimer-seen';

/** Czy użytkownik widział już jednorazowe przypomnienie 16+ / „na własną odpowiedzialność". */
export async function hasSeenDisclaimer(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(STORAGE_KEY)) === '1';
  } catch {
    return false;
  }
}

/** Zapamiętuje, że przypomnienie zostało potwierdzone (nie pokazujemy go ponownie). */
export async function markDisclaimerSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // brak zapisu nie blokuje korzystania z aplikacji
  }
}
