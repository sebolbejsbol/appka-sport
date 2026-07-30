import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  changeLocale as changeLocaleInternal,
  getLocale,
  initLocale,
  subscribeLocale,
  type Locale,
} from '@/i18n';

type LocaleContextValue = {
  locale: Locale;
  ready: boolean;
  setLocale: (locale: Locale) => Promise<void>;
};

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getLocale());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void initLocale().then((next) => {
      if (!active) return;
      setLocaleState(next);
      setReady(true);
    });
    const unsubscribe = subscribeLocale((next) => setLocaleState(next));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      ready,
      setLocale: changeLocaleInternal,
    }),
    [locale, ready],
  );

  if (!ready) return null;

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error('useLocale must be used within a LocaleProvider');
  }
  return ctx;
}
