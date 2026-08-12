-- Migracja 0074: mecze fazy grupowej (tournament_matches), generowanie
-- terminarza "każdy z każdym" w obrębie grupy, wpisywanie/reset wyniku,
-- odczyt listy meczów oraz obliczana na żywo tabela (standings) z
-- rozstrzyganiem remisów punktowych head-to-head (tylko dla par 2-drużynowych).
-- Uruchom w Supabase: Dashboard -> SQL Editor -> New query -> wklej całość -> Run.
-- Idempotentna (bezpieczna do ponownego uruchomienia).

-- 1) Tabela meczów
create table if not exists public.tournament_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  group_id uuid not null references public.tournament_groups (id) on delete cascade,
  team_a_id uuid not null references public.teams (id) on delete cascade,
  team_b_id uuid not null references public.teams (id) on delete cascade,

  score_a integer,
  score_b integer,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed')),

  created_at timestamptz not null default now(),
  completed_at timestamptz,

  constraint tournament_matches_teams_distinct check (team_a_id <> team_b_id),
  constraint tournament_matches_unique_pair unique (group_id, team_a_id, team_b_id),
  constraint tournament_matches_scores_together check (
    (status = 'scheduled' and score_a is null and score_b is null)
    or (status = 'completed' and score_a is not null and score_b is not null)
  ),
  constraint tournament_matches_scores_nonneg check (
    (score_a is null or score_a >= 0) and (score_b is null or score_b >= 0)
  )
);

create index if not exists tournament_matches_tournament_idx
  on public.tournament_matches (tournament_id);
create index if not exists tournament_matches_group_idx
  on public.tournament_matches (group_id);

-- 2) RLS: defense-in-depth, jak przy tournament_teams (realna kontrola jest
--    w RPC poniżej, security definer omija RLS).
alter table public.tournament_matches enable row level security;

drop policy if exists "Matches are viewable by authenticated users"
  on public.tournament_matches;
create policy "Matches are viewable by authenticated users"
  on public.tournament_matches for select
  to authenticated
  using (
    public.is_app_admin()
    or exists (
      select 1 from public.tournaments t
      where t.id = tournament_matches.tournament_id
        and t.status not in ('draft', 'cancelled')
    )
  );
-- Celowo brak insert/update/delete policy: wszystkie zapisy idą przez RPC poniżej.

-- 3) Wygenerowanie terminarza "każdy z każdym" w obrębie każdej grupy
--    (tylko drużyny zaakceptowane i przypisane do grupy). Idempotentne
--    (on conflict do nothing) — bezpieczne przy ponownym wywołaniu.
create or replace function public.admin_generate_group_matches(p_tournament_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_group record;
  v_team_ids uuid[];
  v_i integer; v_j integer;
  v_created integer := 0;
begin
  if v_actor is null or not public.is_app_admin() then return 'not_admin'; end if;

  if not exists (select 1 from public.tournaments where id = p_tournament_id) then
    return 'tournament_not_found';
  end if;

  for v_group in
    select id from public.tournament_groups where tournament_id = p_tournament_id
  loop
    select coalesce(array_agg(tt.team_id order by tt.team_id), array[]::uuid[])
      into v_team_ids
      from public.tournament_teams tt
      where tt.tournament_id = p_tournament_id
        and tt.status = 'approved'
        and tt.group_id = v_group.id;

    if array_length(v_team_ids, 1) is not null then
      for v_i in 1 .. array_length(v_team_ids, 1) loop
        for v_j in (v_i + 1) .. array_length(v_team_ids, 1) loop
          insert into public.tournament_matches (tournament_id, group_id, team_a_id, team_b_id)
          values (p_tournament_id, v_group.id, v_team_ids[v_i], v_team_ids[v_j])
          on conflict (group_id, team_a_id, team_b_id) do nothing;
          if found then v_created := v_created + 1; end if;
        end loop;
      end loop;
    end if;
  end loop;

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (v_actor, 'generate_group_matches', 'tournament', p_tournament_id,
    jsonb_build_object('matches_created', v_created));

  return 'ok';
end;
$$;

revoke all on function public.admin_generate_group_matches(uuid) from public;
grant execute on function public.admin_generate_group_matches(uuid) to authenticated;

-- 4) Wpisanie/poprawienie wyniku meczu
create or replace function public.admin_record_match_result(
  p_match_id uuid, p_score_a integer, p_score_b integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_tournament_id uuid;
  v_allow_draws boolean;
begin
  if v_actor is null or not public.is_app_admin() then return 'not_admin'; end if;

  select m.tournament_id, t.allow_draws into v_tournament_id, v_allow_draws
    from public.tournament_matches m
    join public.tournaments t on t.id = m.tournament_id
    where m.id = p_match_id;
  if not found then return 'not_found'; end if;

  if p_score_a is null or p_score_b is null or p_score_a < 0 or p_score_b < 0 then
    return 'invalid_input';
  end if;
  if p_score_a = p_score_b and not v_allow_draws then
    return 'draws_not_allowed';
  end if;

  update public.tournament_matches
    set score_a = p_score_a, score_b = p_score_b,
        status = 'completed', completed_at = now()
    where id = p_match_id;

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (v_actor, 'record_match_result', 'tournament_match', p_match_id,
    jsonb_build_object('score_a', p_score_a, 'score_b', p_score_b));

  return 'ok';
end;
$$;

revoke all on function public.admin_record_match_result(uuid, integer, integer) from public;
grant execute on function public.admin_record_match_result(uuid, integer, integer) to authenticated;

-- 5) Reset meczu do stanu "scheduled" (cofnięcie błędnie wpisanego wyniku)
create or replace function public.admin_reset_match(p_match_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not public.is_app_admin() then return 'not_admin'; end if;

  if not exists (select 1 from public.tournament_matches where id = p_match_id) then
    return 'not_found';
  end if;

  update public.tournament_matches
    set score_a = null, score_b = null, status = 'scheduled', completed_at = null
    where id = p_match_id;

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (v_actor, 'reset_match', 'tournament_match', p_match_id, '{}'::jsonb);

  return 'ok';
end;
$$;

revoke all on function public.admin_reset_match(uuid) from public;
grant execute on function public.admin_reset_match(uuid) to authenticated;

-- 6) Lista meczów turnieju (z nazwami drużyn i grupy)
create or replace function public.list_tournament_matches(p_tournament_id uuid)
returns table (
  id uuid, group_id uuid, group_name text,
  team_a_id uuid, team_a_name text, team_b_id uuid, team_b_name text,
  score_a integer, score_b integer, status text, completed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id, m.group_id, g.name,
    m.team_a_id, ta.name, m.team_b_id, tb.name,
    m.score_a, m.score_b, m.status, m.completed_at
  from public.tournament_matches m
  join public.tournament_groups g on g.id = m.group_id
  join public.teams ta on ta.id = m.team_a_id
  join public.teams tb on tb.id = m.team_b_id
  where m.tournament_id = p_tournament_id
  order by g.sort_order, m.created_at;
$$;

revoke all on function public.list_tournament_matches(uuid) from public;
grant execute on function public.list_tournament_matches(uuid) to authenticated;

-- 7) Tabela (standings) liczona na żywo z ukończonych meczów, z zasadami
--    tournaments.points_win/points_draw/points_loss i rozstrzyganiem
--    remisów: punkty -> różnica -> bezpośredni pojedynek (tylko remis
--    dokładnie 2-drużynowy) -> nazwa drużyny.
create or replace function public.get_tournament_standings(p_tournament_id uuid)
returns table (
  group_id uuid, group_name text, team_id uuid, team_name text,
  played integer, wins integer, draws integer, losses integer,
  points_for integer, points_against integer, point_diff integer,
  points integer, rank integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pts_win integer; v_pts_draw integer; v_pts_loss integer;
begin
  select t.points_win, t.points_draw, t.points_loss
    into v_pts_win, v_pts_draw, v_pts_loss
    from public.tournaments t where t.id = p_tournament_id;
  if not found then return; end if;

  return query
  with match_legs as (
    select m.group_id, m.team_a_id as tid, m.team_b_id as oid, m.score_a as pf, m.score_b as pa
      from public.tournament_matches m
      where m.tournament_id = p_tournament_id and m.status = 'completed'
    union all
    select m.group_id, m.team_b_id as tid, m.team_a_id as oid, m.score_b as pf, m.score_a as pa
      from public.tournament_matches m
      where m.tournament_id = p_tournament_id and m.status = 'completed'
  ),
  per_team as (
    select
      tt.group_id, tt.team_id, tm.name as team_name,
      count(ml.tid)::integer as played,
      count(*) filter (where ml.pf > ml.pa)::integer as wins,
      count(*) filter (where ml.pf = ml.pa)::integer as draws,
      count(*) filter (where ml.pf < ml.pa)::integer as losses,
      coalesce(sum(ml.pf), 0)::integer as points_for,
      coalesce(sum(ml.pa), 0)::integer as points_against,
      coalesce(sum(ml.pf) - sum(ml.pa), 0)::integer as point_diff,
      (count(*) filter (where ml.pf > ml.pa) * v_pts_win
        + count(*) filter (where ml.pf = ml.pa) * v_pts_draw
        + count(*) filter (where ml.pf < ml.pa) * v_pts_loss)::integer as points_total
    from public.tournament_teams tt
    join public.teams tm on tm.id = tt.team_id
    left join match_legs ml on ml.group_id = tt.group_id and ml.tid = tt.team_id
    where tt.tournament_id = p_tournament_id
      and tt.status = 'approved'
      and tt.group_id is not null
    group by tt.group_id, tt.team_id, tm.name
  ),
  tie_sized as (
    select pt.*, count(*) over (partition by pt.group_id, pt.points_total, pt.point_diff) as tie_group_size
    from per_team pt
  ),
  h2h as (
    select
      ts.group_id, ts.team_id,
      coalesce((
        select case when m.score_a > m.score_b then 1 when m.score_a < m.score_b then -1 else 0 end
          * case when m.team_a_id = ts.team_id then 1 else -1 end
        from public.tournament_matches m
        join tie_sized other
          on other.group_id = ts.group_id
          and other.points_total = ts.points_total
          and other.point_diff = ts.point_diff
          and other.team_id <> ts.team_id
        where m.tournament_id = p_tournament_id
          and m.status = 'completed'
          and ts.tie_group_size = 2
          and ((m.team_a_id = ts.team_id and m.team_b_id = other.team_id)
            or (m.team_b_id = ts.team_id and m.team_a_id = other.team_id))
        limit 1
      ), 0) as h2h_score
    from tie_sized ts
  )
  select
    ts.group_id, g.name as group_name, ts.team_id, ts.team_name,
    ts.played, ts.wins, ts.draws, ts.losses,
    ts.points_for, ts.points_against, ts.point_diff, ts.points_total as points,
    row_number() over (
      partition by ts.group_id
      order by ts.points_total desc, ts.point_diff desc, h2h.h2h_score desc, ts.team_name asc
    )::integer as rank
  from tie_sized ts
  join h2h on h2h.group_id = ts.group_id and h2h.team_id = ts.team_id
  join public.tournament_groups g on g.id = ts.group_id
  order by ts.group_id, rank;
end;
$$;

revoke all on function public.get_tournament_standings(uuid) from public;
grant execute on function public.get_tournament_standings(uuid) to authenticated;

-- 8) Dopięcie: przejście registration_closed -> ready generuje terminarz.
--    Ta sama sygnatura co w migracji 0073 — bez zmiany kształtu kolumn,
--    więc create or replace wystarczy (bez drop function).
create or replace function public.admin_set_tournament_status(
  p_tournament_id uuid, p_new_status text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_status text;
  v_legal text[];
  v_min_teams integer;
  v_approved_count integer;
begin
  if v_actor is null or not public.is_app_admin() then
    return 'not_admin';
  end if;

  select status into v_status from public.tournaments where id = p_tournament_id;
  if not found then return 'not_found'; end if;

  v_legal := case v_status
    when 'draft' then array['registration_open', 'cancelled']
    when 'registration_open' then array['registration_closed', 'cancelled']
    when 'registration_closed' then array['ready', 'registration_open', 'cancelled']
    when 'ready' then array['in_progress', 'cancelled']
    when 'in_progress' then array['completed', 'cancelled']
    else array[]::text[]
  end;

  if p_new_status is null or not (p_new_status = any(v_legal)) then
    return 'invalid_transition';
  end if;

  if v_status = 'registration_closed' and p_new_status = 'ready' then
    select min_teams into v_min_teams from public.tournaments where id = p_tournament_id;
    select count(*) into v_approved_count
      from public.tournament_teams
      where tournament_id = p_tournament_id and status = 'approved';
    if v_approved_count < v_min_teams then
      return 'not_enough_teams';
    end if;
  end if;

  update public.tournaments set status = p_new_status where id = p_tournament_id;

  if v_status = 'registration_closed' and p_new_status = 'ready' then
    perform public.admin_generate_group_matches(p_tournament_id);
  end if;

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (v_actor, 'set_tournament_status', 'tournament', p_tournament_id,
    jsonb_build_object('from', v_status, 'to', p_new_status));

  return 'ok';
end;
$$;

revoke all on function public.admin_set_tournament_status(uuid, text) from public;
grant execute on function public.admin_set_tournament_status(uuid, text) to authenticated;

notify pgrst, 'reload schema';
