import type { Session } from '@supabase/supabase-js';
import { router, type Href } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import { createSessionFromAuthUrl, subscribeToAuthDeepLinks } from '@/lib/auth-linking';
import { supabase } from '@/lib/supabase';

/**
 * Kontekst sesji użytkownika oparty na Supabase.
 * - przy starcie odczytuje zapisaną sesję (jeśli ktoś był zalogowany),
 * - nasłuchuje zmian (logowanie / wylogowanie / odświeżenie tokenu),
 * - udostępnia wylogowanie.
 * Samo logowanie i rejestracja dzieją się w ekranach (auth) przez supabase.auth.
 */
type SessionContextValue = {
  session: Session | null;
  isLoading: boolean;
  /** Sesja z linku odzyskiwania hasła — użytkownik musi ustawić nowe hasło przed wejściem w app. */
  isPasswordRecovery: boolean;
  clearPasswordRecovery: () => void;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSession musi być użyte wewnątrz <SessionProvider />');
  }
  return value;
}

async function handleRecoveryUrl(url: string): Promise<void> {
  if (!url.includes('reset-password') && !url.includes('type=recovery')) return;
  const ok = await createSessionFromAuthUrl(url);
  if (ok) {
    router.replace('/reset-password' as Href);
  }
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  const clearPasswordRecovery = useCallback(() => {
    setIsPasswordRecovery(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
        router.replace('/reset-password' as Href);
      }
    });

    const unsubscribeLinks = subscribeToAuthDeepLinks((url) => {
      void handleRecoveryUrl(url);
    });

    return () => {
      data.subscription.unsubscribe();
      unsubscribeLinks();
    };
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      isLoading,
      isPasswordRecovery,
      clearPasswordRecovery,
      signOut: async () => {
        setIsPasswordRecovery(false);
        await supabase.auth.signOut();
      },
    }),
    [session, isLoading, isPasswordRecovery, clearPasswordRecovery],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
