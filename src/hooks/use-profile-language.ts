import { useEffect, useRef } from 'react';

import { useSession } from '@/context/session';
import { changeLocale, getLocale } from '@/i18n';
import { getOwnLanguage } from '@/lib/profiles';

/**
 * Po zalogowaniu ustawia język interfejsu zgodnie z preferencją zapisaną
 * w profilu użytkownika (wybraną przy rejestracji lub w ustawieniach).
 * Działa raz na danego użytkownika w cyklu życia sesji.
 */
export function useProfileLanguage(): void {
  const { session } = useSession();
  const userId = session?.user?.id;
  const appliedForUser = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) {
      appliedForUser.current = null;
      return;
    }
    if (appliedForUser.current === userId) return;
    appliedForUser.current = userId;

    let active = true;
    void getOwnLanguage(userId).then((language) => {
      if (!active || !language) return;
      if (language !== getLocale()) {
        void changeLocale(language);
      }
    });

    return () => {
      active = false;
    };
  }, [userId]);
}
