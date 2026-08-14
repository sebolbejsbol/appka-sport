# send-web-push

Wysyła jedno powiadomienie Web Push (VAPID) do jednej subskrypcji
przeglądarki. Wywoływana wyłącznie z `public.send_web_push()` w Postgresie
(przez `pg_net`) — nigdy bezpośrednio z klienta.

## Wdrożenie (jednorazowo, ręcznie)

Wymaga [Supabase CLI](https://supabase.com/docs/guides/cli) zalogowanego
(`supabase login`) lub `SUPABASE_ACCESS_TOKEN` w env (już jest w `.env` w
repo, patrz `SUPABASE_ACCESS_TOKEN`/`SUPABASE_PROJECT_REF`).

```bash
supabase functions deploy send-web-push --project-ref gjkbnkaijlempveotnui --no-verify-jwt
```

`--no-verify-jwt` jest wymagane — funkcja jest wołana przez `pg_net`, nie
przez zalogowanego użytkownika z Supabase JWT, więc autoryzacja jest
własnym mechanizmem (nagłówek `x-notify-secret`, patrz niżej), nie
standardowym Supabase auth.

## Sekrety (jednorazowo, ręcznie)

Wygenerowane przez `scripts/generate-vapid-keys.mjs` przy pierwszym
budowaniu tej funkcji (2026-08-14) i zapisane **tylko lokalnie** w `.env`
(w gitignore, nigdy nie trafiają do repo) — `VAPID_PRIVATE_KEY`,
`VAPID_SUBJECT`, `NOTIFY_SHARED_SECRET`. Publiczny klucz
(`VAPID_PUBLIC_KEY`/`EXPO_PUBLIC_VAPID_PUBLIC_KEY`) nie jest sekretem, jest
też w `.env` i trafia do klienta.

Ustaw je jako sekrety Edge Function, wklejając wartości z `.env`:

```bash
supabase secrets set --project-ref gjkbnkaijlempveotnui \
  VAPID_PUBLIC_KEY=<EXPO_PUBLIC_VAPID_PUBLIC_KEY z .env> \
  VAPID_PRIVATE_KEY=<VAPID_PRIVATE_KEY z .env> \
  VAPID_SUBJECT=<VAPID_SUBJECT z .env> \
  NOTIFY_SHARED_SECRET=<NOTIFY_SHARED_SECRET z .env>
```

**Ten sam** `NOTIFY_SHARED_SECRET` musi też być ustawiony w Postgresie, bo
`public.send_web_push()` czyta go stamtąd, żeby dołączyć do nagłówka
wywołania — inaczej wysyłka po cichu nic nie robi (fail-safe). Uruchom w
SQL Editorze albo przez `node scripts/run-supabase-sql.mjs` (wklej wartość
`NOTIFY_SHARED_SECRET` z `.env`):

```sql
alter database postgres set app.settings.notify_shared_secret = '<NOTIFY_SHARED_SECRET z .env>';
```

Publiczny klucz VAPID trzeba też wpisać po stronie klienta —
już zrobione w `.env` (`EXPO_PUBLIC_VAPID_PUBLIC_KEY`), ale **`.env` nie
trafia na Vercel automatycznie** — dodaj tę samą zmienną w
Vercel → Project Settings → Environment Variables, inaczej produkcyjny
build weba nie będzie miał klucza i przycisk "włącz powiadomienia" będzie
zawsze pokazywał "niedostępne".

## Dlaczego w ogóle osobna funkcja, a nie SQL

Web Push wymaga podpisania nagłówka JWT kluczem VAPID (ECDSA P-256) i
zaszyfrowania treści powiadomienia (ECDH + HKDF + AES-128-GCM) zgodnie ze
specyfikacją RFC 8291 — Postgres/pg_net nie ma do tego wbudowanych narzędzi.
Ta funkcja (Deno, `npm:web-push`) robi dokładnie to i tylko to; cała reszta
logiki (kto, kiedy, o czym) zostaje w Postgresie w `notify_user()`, tak jak
dla Expo Push.

## Bezpieczeństwo

Bez `NOTIFY_SHARED_SECRET` ta funkcja byłaby otwartym relayem — VAPID
identyfikuje NADAWCĘ, nie autoryzuje dostępu do konkretnej subskrypcji, więc
ktokolwiek zna URL funkcji i adres cudzej subskrypcji mógłby przez nią
wysyłać dowolny push. Nagłówek `x-notify-secret` musi się zgadzać z
`NOTIFY_SHARED_SECRET`, inaczej `401`.
