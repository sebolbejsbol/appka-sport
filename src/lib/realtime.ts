import { supabase } from '@/lib/supabase';

let channelSeq = 0;

/**
 * Subskrybuje zmiany w tabeli Postgres i wywołuje `onChange` przy każdej
 * pasującej zmianie. RLS ogranicza dostarczane wiersze do tego, co
 * subskrybent może odczytać, więc filtr nie jest wymagany dla tabel, gdzie
 * polityka SELECT już zawęża wiersze do bieżącego użytkownika.
 * Unikalny temat na subskrypcję unika kolizji z nieposprzątanym kanałem po
 * szybkim remontcie ekranu (patrz analogiczny komentarz w lib/messages.ts).
 */
export function subscribeToTable(
  table: string,
  onChange: () => void,
  options?: { filter?: string; event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*' },
): () => void {
  const topic = `rt:${table}:${options?.filter ?? 'all'}:${++channelSeq}`;
  const channel = supabase
    .channel(topic)
    .on(
      'postgres_changes',
      {
        event: options?.event ?? '*',
        schema: 'public',
        table,
        ...(options?.filter ? { filter: options.filter } : {}),
      },
      () => onChange(),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

/** Debounce, żeby seria szybkich zmian (np. kilku uczestników naraz) dała jedno odświeżenie. */
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  ms: number,
): (...args: Args) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
