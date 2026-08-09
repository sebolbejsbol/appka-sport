import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Brak konfiguracji Supabase. Uzupełnij EXPO_PUBLIC_SUPABASE_URL i EXPO_PUBLIC_SUPABASE_KEY w pliku .env i zrestartuj serwer.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Na webie po powrocie z logowania OAuth (Google/Facebook/Apple) Supabase
    // musi odczytać sesję z adresu URL. Na telefonie ten mechanizm nie ma
    // zastosowania — tam OAuth wraca przez deep link (patrz src/lib/oauth.ts).
    detectSessionInUrl: Platform.OS === 'web',
  },
});

// Na urządzeniu mobilnym odświeżamy token tylko gdy aplikacja jest aktywna (oszczędność baterii).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
