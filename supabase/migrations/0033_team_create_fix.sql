-- Migracja 0033: naprawa tworzenia drużyny
-- Uruchom w Supabase SQL Editor jeśli create_team zwraca błąd.
-- Wymaga: 0027 (conversations), 0032 (teams) — lub uruchom całe 0032 przed tym.

-- Kolumna kind na rozmowach (jeśli 0032 przerwało się wcześniej)
alter table public.conversations
  add column if not exists kind text not null default 'dm';

do $$
begin
  alter table public.conversations
    add constraint conversations_kind_allowed
    check (kind in ('dm', 'team'));
exception
  when duplicate_object then null;
end;
$$;

-- create_team z wyłączonym RLS wewnątrz funkcji (Supabase / PG15+)
create or replace function public.create_team(
  p_name text,
  p_description text default null,
  p_sport text default 'basketball',
  p_logo_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := trim(coalesce(p_name, ''));
  v_team_id uuid;
  v_conv uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'invalid_name';
  end if;
  if p_sport is null or p_sport not in ('basketball', 'football', 'volleyball', 'handball') then
    raise exception 'invalid_sport';
  end if;

  insert into public.teams (name, description, sport, logo_url, owner_id)
  values (
    v_name,
    nullif(trim(coalesce(p_description, '')), ''),
    p_sport,
    nullif(trim(coalesce(p_logo_url, '')), ''),
    v_uid
  )
  returning id into v_team_id;

  insert into public.team_members (team_id, user_id, role)
  values (v_team_id, v_uid, 'owner');

  insert into public.conversations (kind) values ('team') returning id into v_conv;

  insert into public.team_conversations (team_id, conversation_id)
  values (v_team_id, v_conv);

  insert into public.conversation_members (conversation_id, user_id)
  values (v_conv, v_uid);

  return v_team_id;
end;
$$;

grant execute on function public.create_team(text, text, text, text) to authenticated;

-- Storage opcjonalnie (nie blokuje reszty przy błędzie)
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'team-logos',
    'team-logos',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']
  )
  on conflict (id) do nothing;
exception
  when others then
    raise notice 'team-logos bucket skipped: %', sqlerrm;
end;
$$;

notify pgrst, 'reload schema';
