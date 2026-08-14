-- Migracja 0090: link zapraszający do drużyny — każdy z linkiem dołącza
-- od razu jako członek (bez wcześniejszego wyszukiwania konkretnej osoby,
-- w odróżnieniu od invite_to_team). Używane m.in. przy budowaniu drużyny
-- na turniej: "Udostępnij link" -> ktokolwiek go otworzy (i ma/zakłada
-- konto) dołącza automatycznie.
-- Wymaga: 0032 (teams, team_members, is_team_manager, is_team_member).

alter table public.teams
  add column if not exists invite_code text;

create unique index if not exists teams_invite_code_idx
  on public.teams (invite_code)
  where invite_code is not null;

create or replace function public.ensure_team_invite_code(p_team_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_attempt int := 0;
begin
  if not public.is_team_manager(p_team_id, auth.uid()) then
    raise exception 'forbidden';
  end if;

  select invite_code into v_code from public.teams where id = p_team_id;
  if v_code is not null then
    return v_code;
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_code := substr(md5(gen_random_uuid()::text), 1, 8);
    begin
      update public.teams set invite_code = v_code where id = p_team_id;
      return v_code;
    exception when unique_violation then
      if v_attempt > 5 then
        raise;
      end if;
    end;
  end loop;
end;
$$;

grant execute on function public.ensure_team_invite_code(uuid) to authenticated;

create or replace function public.join_team_via_code(p_code text)
returns table (
  result text,
  team_id uuid,
  team_name text,
  tournament_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_team_id uuid;
  v_team_name text;
  v_tournament_id uuid;
  v_conv uuid;
begin
  if v_uid is null then
    return query select 'not_authenticated'::text, null::uuid, null::text, null::uuid;
    return;
  end if;

  select t.id, t.name, t.tournament_id into v_team_id, v_team_name, v_tournament_id
  from public.teams t
  where t.invite_code = p_code;

  if v_team_id is null then
    return query select 'not_found'::text, null::uuid, null::text, null::uuid;
    return;
  end if;

  if public.is_team_member(v_team_id, v_uid) then
    return query select 'already_member'::text, v_team_id, v_team_name, v_tournament_id;
    return;
  end if;

  insert into public.team_members (team_id, user_id, role)
  values (v_team_id, v_uid, 'member');

  select tc.conversation_id into v_conv
  from public.team_conversations tc
  where tc.team_id = v_team_id;

  if v_conv is not null then
    insert into public.conversation_members (conversation_id, user_id)
    values (v_conv, v_uid)
    on conflict do nothing;
  end if;

  return query select 'ok'::text, v_team_id, v_team_name, v_tournament_id;
end;
$$;

grant execute on function public.join_team_via_code(text) to authenticated;
