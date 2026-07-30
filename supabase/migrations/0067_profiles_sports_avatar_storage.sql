-- ═══════════════════════════════════════════════════════════════════════════
-- 0067 — Kolumna sports, avatar RPC, bucket avatars, rejestracja ze sportami
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Dyscypliny w profilu (używane przez update_own_profile od 0065) ─────
alter table public.profiles
  add column if not exists sports text[] not null default '{}';

-- ─── 2. Zapis własnego avatara ──────────────────────────────────────────────
create or replace function public.set_own_avatar(p_avatar_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_url text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  v_url := nullif(trim(coalesce(p_avatar_url, '')), '');

  update public.profiles
  set avatar_url = v_url
  where id = v_uid;
end;
$$;

grant execute on function public.set_own_avatar(text) to authenticated;

-- ─── 3. Rejestracja: zapis sportów + odporna na błędy ─────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nick text := nullif(trim(new.raw_user_meta_data ->> 'nick'), '');
  v_country text := nullif(upper(trim(new.raw_user_meta_data ->> 'country_code')), '');
  v_language text := lower(trim(coalesce(new.raw_user_meta_data ->> 'language', '')));
  v_birth_year int;
  v_sports text[] := '{}';
  v_sports_json json;
  v_allowed_sports constant text[] := array[
    'basketball', 'football', 'volleyball', 'tennis', 'running',
    'padel', 'badminton', 'fitness', 'handball'
  ];
begin
  if v_country is not null and v_country !~ '^[A-Z]{2}$' then
    v_country := null;
  end if;

  if v_language is null or v_language not in ('pl', 'en') then
    v_language := 'pl';
  end if;

  begin
    v_birth_year := (new.raw_user_meta_data ->> 'birth_year')::int;
  exception
    when others then
      v_birth_year := null;
  end;

  begin
    v_sports_json := new.raw_user_meta_data -> 'sports';
    if json_typeof(v_sports_json) = 'array' then
      select coalesce(array_agg(elem), '{}')
      into v_sports
      from (
        select json_array_elements_text(v_sports_json) as elem
      ) s
      where elem = any (v_allowed_sports);
    end if;
  exception
    when others then
      v_sports := '{}';
  end;

  begin
    insert into public.profiles (id, nick, birth_year, country_code, language, sports)
    values (new.id, v_nick, v_birth_year, v_country, v_language, coalesce(v_sports, '{}'))
    on conflict (id) do nothing;
  exception
    when others then
      null;
  end;

  return new;
end;
$$;

-- ─── 4. Storage: avatary użytkowników ───────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists "Users upload own avatars" on storage.objects;
create policy "Users upload own avatars"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users update own avatars" on storage.objects;
create policy "Users update own avatars"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Public read avatars" on storage.objects;
create policy "Public read avatars"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars');

notify pgrst, 'reload schema';
