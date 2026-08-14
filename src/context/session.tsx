import type { Session } from '@supabase/supabase-js';
import { router, type Href } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import { createSessionFromAuthUrl, subscribeToAuthDeepLinks } from '@/lib/auth-linking';
import { consumePendingJoinCode, extractJoinCodeFromUrl, savePendingJoinCode } from '@/lib/pending-team-join';
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
  /**
   * Konto istnieje, ale profil nie ma jeszcze nicku (typowe po pierwszym
   * logowaniu przez Google/Facebook/Apple — dostawca nie przekazuje nicku).
   * Użytkownik musi go dokończyć na /complete-profile, zanim wejdzie w appkę.
   */
  needsProfileSetup: boolean;
  /** Wywoływane przez ekran /complete-profile zaraz po udanym zapisaniu nicku. */
  markProfileComplete: () => void;
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

/** Profil bez nicku = konto nowe przez OAuth, które jeszcze nie dokończyło rejestracji. */
async function fetchNeedsProfileSetup(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('nick')
    .eq('id', userId)
    .maybeSingle<{ nick: string | null }>();
  if (error) return false;
  return !data?.nick;
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);
  const checkedUserIdRef = useRef<string | null>(null);

  const clearPasswordRecovery = useCallback(() => {
    setIsPasswordRecovery(false);
  }, []);

  const markProfileComplete = useCallback(() => {
    setNeedsProfileSetup(false);
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
      if (event === 'SIGNED_OUT') {
        checkedUserIdRef.current = null;
        setNeedsProfileSetup(false);
      }
    });

    const unsubscribeLinks = subscribeToAuthDeepLinks((url) => {
      void handleRecoveryUrl(url);
      const joinCode = extractJoinCodeFromUrl(url);
      if (joinCode) void savePendingJoinCode(joinCode);
    });

    return () => {
      data.subscription.unsubscribe();
      unsubscribeLinks();
    };
  }, []);

  // Jeśli ktoś otworzył link zapraszający do drużyny przed zalogowaniem,
  // kod czeka w AsyncStorage — jak tylko pojawi się sesja, dokańczamy dołączenie.
  useEffect(() => {
    if (!session?.user?.id) return;
    void consumePendingJoinCode().then((code) => {
      if (code) router.push(`/join-team/${code}` as Href);
    });
  }, [session?.user?.id]);

  // Sprawdzamy brak nicku raz na sesję (nie przy każdym odświeżeniu tokenu).
  useEffect(() => {
    const userId = session?.user?.id ?? null;
    if (!userId) return;
    if (checkedUserIdRef.current === userId) return;
    checkedUserIdRef.current = userId;

    void fetchNeedsProfileSetup(userId).then((needsSetup) => {
      setNeedsProfileSetup(needsSetup);
      if (needsSetup) {
        router.replace('/complete-profile' as Href);
      }
    });
  }, [session?.user?.id]);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      isLoading,
      isPasswordRecovery,
      clearPasswordRecovery,
      needsProfileSetup,
      markProfileComplete,
      signOut: async () => {
        setIsPasswordRecovery(false);
        setNeedsProfileSetup(false);
        checkedUserIdRef.current = null;
        await supabase.auth.signOut();
      },
    }),
    [session, isLoading, isPasswordRecovery, clearPasswordRecovery, needsProfileSetup, markProfileComplete],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
