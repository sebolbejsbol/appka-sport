import * as Linking from 'expo-linking';

import { supabase } from '@/lib/supabase';

/** Adres przekierowania z e-maila resetu hasła (deep link do aplikacji). */
export function passwordResetRedirectUrl(): string {
  return Linking.createURL('/reset-password');
}

function parseAuthParams(url: string): URLSearchParams {
  const hash = url.includes('#') ? url.split('#')[1] : '';
  const query = url.includes('?') ? url.split('?').slice(1).join('?') : '';
  const raw = hash || query;
  return new URLSearchParams(raw);
}

/** Ustawia sesję z linku odzyskiwania hasła (tokeny w fragmencie URL). */
export async function createSessionFromAuthUrl(url: string): Promise<boolean> {
  const params = parseAuthParams(url);
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return false;

  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  return !error;
}

/** Odczytuje początkowy URL (cold start) i nasłuchuje kolejnych deep linków. */
export function subscribeToAuthDeepLinks(onUrl: (url: string) => void): () => void {
  void Linking.getInitialURL().then((url) => {
    if (url) onUrl(url);
  });

  const sub = Linking.addEventListener('url', ({ url }) => onUrl(url));
  return () => sub.remove();
}
