-- Migracja 0001: profile użytkowników
-- Uruchom w Supabase: Dashboard → SQL Editor → New query → wklej całość → Run.
-- Skrypt jest bezpieczny do ponownego uruchomienia (idempotentny).

-- 1) Tabela profili
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nick text,
  birth_year integer,
  show_birth_year boolean not null default true,
  gender text check (gender in ('male', 'female', 'other')),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Publiczne profile użytkowników (nick, rok urodzenia, płeć, avatar).';

-- 2) Włącz Row Level Security (bez tego nikt nie ma dostępu)
alter table public.profiles enable row level security;

-- 3) Polityki dostępu
-- Profile są publiczne dla zalogowanych (inni gracze mogą je oglądać).
drop policy if exists "Profiles are viewable by authenticated users" on public.profiles;
create policy "Profiles are viewable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

-- Użytkownik może utworzyć WYŁĄCZNIE swój własny profil.
drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

-- Użytkownik może edytować WYŁĄCZNIE swój własny profil.
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 4) Automatyczne pole updated_at przy każdej edycji
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- 5) Automatyczne utworzenie profilu po rejestracji (z danych podanych przy zakładaniu konta)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nick, birth_year)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'nick', ''),
    (new.raw_user_meta_data ->> 'birth_year')::int
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 6) Uzupełnienie profili dla kont założonych ZANIM powstał ten trigger
insert into public.profiles (id, nick, birth_year)
select
  u.id,
  nullif(u.raw_user_meta_data ->> 'nick', ''),
  (u.raw_user_meta_data ->> 'birth_year')::int
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);
