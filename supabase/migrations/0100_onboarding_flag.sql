-- Migracja 0100: flaga onboardingu dla nowych użytkowników (Prompt 2).
--
-- Nowy carousel onboardingowy (mapa/eventy, dołączanie, znajomi, check-in,
-- ranking/XP + próbny event) ma się pokazać RAZ, zaraz po dokończeniu
-- profilu, a nigdy istniejącym userom retroaktywnie. Sztuczka z dwoma
-- ALTERami: najpierw dodajemy kolumnę z default TRUE, więc WSZYSCY już
-- istniejący userzy dostają true (pomiń onboarding) bez osobnego UPDATE;
-- dopiero potem zmieniamy default na FALSE, więc każdy NOWY wiersz (nowa
-- rejestracja) od teraz startuje z false (pokaż onboarding).
--
-- Gating po stronie klienta: src/context/session.tsx (needsOnboarding, ten
-- sam wzorzec co needsProfileSetup) + src/app/_layout.tsx (Stack.Protected
-- na grupę (onboarding)).
--
-- Uruchom w Supabase: Dashboard -> SQL Editor -> New query -> wklej całość -> Run,
-- albo: node scripts/run-supabase-sql.mjs supabase/migrations/0100_onboarding_flag.sql
-- Idempotentna.

alter table public.profiles
  add column if not exists has_completed_onboarding boolean not null default true;

alter table public.profiles
  alter column has_completed_onboarding set default false;

notify pgrst, 'reload schema';
