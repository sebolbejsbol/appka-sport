import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';

import { en } from './en';
import { pl, type Translations } from './pl';

const translations = { pl, en } as const;

export type Locale = keyof typeof translations;

/** Lista języków do wyboru w ustawieniach (etykieta w danym języku + flaga). */
export const SUPPORTED_LOCALES: { code: Locale; label: string; flag: string }[] = [
  { code: 'pl', label: 'Polski', flag: '🇵🇱' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
];

const STORAGE_KEY = 'app.locale';

/**
 * Ścieżki w formie "sekcja.klucz" wyliczone z typu tłumaczeń,
 * dzięki czemu t() podpowiada klucze i wyłapuje literówki na etapie kompilacji.
 */
type DotPaths<T> = {
  [K in keyof T & string]: T[K] extends Record<string, unknown>
    ? `${K}.${DotPaths<T[K]>}`
    : K;
}[keyof T & string];

export type TKey = DotPaths<Translations>;

let currentLocale: Locale = 'pl';

type Listener = (locale: Locale) => void;
const listeners = new Set<Listener>();

export function isSupportedLocale(value: string): value is Locale {
  return value === 'pl' || value === 'en';
}

export function setLocale(locale: Locale): void {
  currentLocale = locale;
  listeners.forEach((cb) => cb(locale));
}

export function getLocale(): Locale {
  return currentLocale;
}

/** Subskrypcja zmian języka (dla providera/hooka). Zwraca funkcję czyszczącą. */
export function subscribeLocale(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Język urządzenia (2-literowy kod) bez dodatkowych zależności natywnych. */
export function getDeviceLanguage(): string {
  try {
    // Web: domyślny interfejs po angielsku (niezależnie od języka przeglądarki),
    // z możliwością ręcznej zmiany w ustawieniach — zgodnie z wymaganiami wersji webowej.
    if (Platform.OS === 'web') return 'en';
    let raw = 'pl';
    if (Platform.OS === 'ios') {
      const settings = NativeModules.SettingsManager?.settings;
      raw =
        settings?.AppleLocale ||
        (Array.isArray(settings?.AppleLanguages) ? settings.AppleLanguages[0] : null) ||
        'pl';
    } else if (Platform.OS === 'android') {
      raw = NativeModules.I18nManager?.localeIdentifier || 'pl';
    }
    return String(raw).slice(0, 2).toLowerCase();
  } catch {
    return 'pl';
  }
}

/**
 * Inicjalizacja języka przy starcie: zapisany wybór użytkownika ma priorytet,
 * w przeciwnym razie próbujemy języka urządzenia, a na końcu domyślnie polski.
 */
export async function initLocale(): Promise<Locale> {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved && isSupportedLocale(saved)) {
      setLocale(saved);
      return saved;
    }
  } catch {
    // ignorujemy błędy odczytu — użyjemy detekcji/urządzenia
  }
  const device = getDeviceLanguage();
  const next: Locale = isSupportedLocale(device) ? device : 'pl';
  setLocale(next);
  return next;
}

/** Zmiana języka na życzenie użytkownika (zapisywana na stałe). */
export async function changeLocale(locale: Locale): Promise<void> {
  setLocale(locale);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // brak zapisu nie blokuje zmiany w trakcie sesji
  }
}

function lookup(dictionary: unknown, parts: string[]): string | undefined {
  const value = parts.reduce<unknown>((accumulator, part) => {
    if (accumulator && typeof accumulator === 'object') {
      return (accumulator as Record<string, unknown>)[part];
    }
    return undefined;
  }, dictionary);
  return typeof value === 'string' ? value : undefined;
}

/**
 * Zwraca przetłumaczony tekst dla danego klucza, np. t('welcome.login').
 * Jeśli brakuje tłumaczenia w aktualnym języku, używamy polskiego jako rezerwy,
 * a jeśli i tam brak — zwracamy sam klucz (łatwo wtedy zauważyć brak tłumaczenia).
 */
export function t(key: TKey): string {
  const parts = key.split('.');
  return (
    lookup(translations[currentLocale], parts) ??
    lookup(translations.pl, parts) ??
    key
  );
}
