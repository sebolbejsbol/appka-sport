-- Migracja 0089: drużyny "tylko na turniej" (stworzone przyciskiem "Stwórz
-- drużynę" na ekranie turnieju) nie mają się pojawiać w ogólnej zakładce
-- Drużyny — to twory jednorazowe, tylko do zapisania się na dany turniej.
-- Wymaga: 0032 (teams, team_members, create_team, list_my_teams),
-- 0071/0072 (tournaments).

alter table public.teams
  add column if not exists tournament_id uuid references public.tournaments (id) on delete set null;

create index if not exists teams_tournament_idx
  on public.teams (tournament_id)
  where tournament_id is not null;

-- create_team: nowy opcjonalny parametr p_tournament_id zmienia sygnaturę —
-- usuwamy starą 4-argumentową wersję, żeby nie zostawić dwóch przeciążeń.
drop function if exists public.create_team(text, text, text, text);

create or replace function public.create_team(
  p_name text,
  p_description text default null,
  p_sport text default 'basketball',
  p_logo_url text default null,
  p_tournament_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
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

  insert into public.teams (name, description, sport, logo_url, owner_id, tournament_id)
  values (
    v_name,
    nullif(trim(coalesce(p_description, '')), ''),
    p_sport,
    nullif(trim(coalesce(p_logo_url, '')), ''),
    v_uid,
    p_tournament_id
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

grant execute on function public.create_team(text, text, text, text, uuid) to authenticated;

-- list_my_teams: wyklucz drużyny turniejowe (tournament_id is not null) —
-- widoczne tylko na ekranie danego turnieju, nie w zakładce Drużyny.
create or replace function public.list_my_teams(p_max_rows integer default 50)
returns table (
  team_id uuid,
  name text,
  logo_url text,
  sport text,
  my_role text,
  member_count bigint,
  unread_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with unread as (
    select
      tc.team_id,
      count(m.id)::bigint as cnt
    from public.team_conversations tc
    join public.conversation_members cm
      on cm.conversation_id = tc.conversation_id and cm.user_id = auth.uid()
    join public.messages m
      on m.conversation_id = tc.conversation_id
      and m.sender_id <> auth.uid()
      and m.created_at > cm.last_read_at
    group by tc.team_id
  )
  select
    t.id as team_id,
    t.name,
    t.logo_url,
    t.sport,
    tm.role as my_role,
    (select count(*)::bigint from public.team_members m where m.team_id = t.id) as member_count,
    coalesce(u.cnt, 0) as unread_count
  from public.team_members tm
  join public.teams t on t.id = tm.team_id
  left join unread u on u.team_id = t.id
  where tm.user_id = auth.uid()
    and t.tournament_id is null
  order by t.updated_at desc
  limit least(greatest(coalesce(p_max_rows, 50), 1), 100);
$$;

grant execute on function public.list_my_teams(integer) to authenticated;

-- Nowa funkcja: moje drużyny (gdziekolwiek jestem członkiem) stworzone
-- konkretnie dla danego turnieju — używana na ekranie turnieju zamiast
-- list_my_teams, żeby drużyny turniejowe dalej tam działały mimo że
-- list_my_teams je teraz pomija.
create or replace function public.list_my_teams_for_tournament(p_tournament_id uuid)
returns table (
  team_id uuid,
  name text,
  logo_url text,
  sport text,
  my_role text,
  member_count bigint,
  unread_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id as team_id,
    t.name,
    t.logo_url,
    t.sport,
    tm.role as my_role,
    (select count(*)::bigint from public.team_members m where m.team_id = t.id) as member_count,
    0::bigint as unread_count
  from public.team_members tm
  join public.teams t on t.id = tm.team_id
  where tm.user_id = auth.uid()
    and t.tournament_id = p_tournament_id
  order by t.created_at desc;
$$;

grant execute on function public.list_my_teams_for_tournament(uuid) to authenticated;
