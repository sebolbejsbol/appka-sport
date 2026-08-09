import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

export type OAuthProvider = 'google' | 'facebook' | 'apple';

export type OAuthResult = { error: string | null; cancelled?: boolean };

/**
 * Adres, na który dostawca OAuth (Google/Facebook/Apple) odsyła po zalogowaniu.
 * Web: bieżące pochodzenie strony (Supabase samo odczyta sesję z adresu URL —
 * patrz `detectSessionInUrl` w supabase.ts). Telefon: deep link do aplikacji
 * przez własny scheme (`appkasport://`), tak jak przy resecie hasła.
 */
function redirectUrl(): string {
  if (Platform.OS === 'web') {
    return typeof window !== 'undefined' ? window.location.origin + '/' : '/';
  }
  return Linking.createURL('/');
}

/**
 * Logowanie/rejestracja przez zewnętrznego dostawcę OAuth.
 * - Web: przekierowuje całą kartę do dostawcy (Supabase samo to robi);
 *   po powrocie sesja pojawia się automatycznie przez onAuthStateChange.
 * - Telefon: otwiera dostawcę w bezpiecznej sesji przeglądarki w aplikacji
 *   (ASWebAuthenticationSession na iOS, Custom Tabs na Androidzie), łapie
 *   deep link powrotny i wymienia kod na sesję.
 */
export async function signInWithProvider(provider: OAuthProvider): Promise<OAuthResult> {
  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: redirectUrl() },
    });
    return { error: error?.message ?? null };
  }

  const redirectTo = redirectUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data?.url) {
    return { error: error?.message ?? 'no_auth_url' };
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type === 'cancel' || result.type === 'dismiss') {
    return { error: null, cancelled: true };
  }
  if (result.type !== 'success' || !result.url) {
    return { error: 'auth_cancelled' };
  }

  const code = extractCode(result.url);
  if (!code) {
    return { error: 'no_code' };
  }

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  return { error: exchangeError?.message ?? null };
}

function extractCode(url: string): string | null {
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return null;
  const params = new URLSearchParams(url.slice(queryStart + 1));
  return params.get('code');
}
