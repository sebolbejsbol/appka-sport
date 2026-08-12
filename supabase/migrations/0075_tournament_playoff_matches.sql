-- Migracja 0075: drabinka play-off (tournament_playoff_matches), generowanie
-- drabinki z automatycznym kwalifikowaniem top-N z każdej grupy (seedowanie
-- po połączonym rankingu, "1 kontra ostatni", wolne losy tylko w 1. rundzie),
-- wpisywanie wyniku z automatycznym awansem zwycięzcy do kolejnej rundy,
-- oraz odczyt drabinki.
-- Uruchom w Supabase: Dashboard -> SQL Editor -> New query -> wklej całość -> Run.
-- Idempotentna (bezpieczna do ponownego uruchomienia).

-- 1) Tabela meczów drabinki
create table if not exists public.tournament_playoff_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  round integer not null check (round >= 1),
  slot integer not null check (slot >= 1),

  team_a_id uuid references public.teams (id) on delete set null,
  team_b_id uuid references public.teams (id) on delete set null,
  score_a integer,
  score_b integer,
  winner_team_id uuid references public.teams (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'scheduled', 'completed')),

  created_at timestamptz not null default now(),
  completed_at timestamptz,

  constraint tournament_playoff_matches_unique unique (tournament_id, round, slot)
);

create index if not exists tournament_playoff_matches_tournament_idx
  on public.tournament_playoff_matches (tournament_id);

-- 2) RLS: defense-in-depth, jak przy tournament_matches.
alter table public.tournament_playoff_matches enable row level security;

drop policy if exists "Playoff matches are viewable by authenticated users"
  on public.tournament_playoff_matches;
create policy "Playoff matches are viewable by authenticated users"
  on public.tournament_playoff_matches for select
  to authenticated
  using (
    public.is_app_admin()
    or exists (
      select 1 from public.tournaments t
      where t.id = tournament_playoff_matches.tournament_id
        and t.status not in ('draft', 'cancelled')
    )
  );
-- Celowo brak insert/update/delete policy: wszystkie zapisy idą przez RPC poniżej.

-- 3) Wygenerowanie drabinki: top p_teams_per_group z każdej grupy (wg
--    get_tournament_standings), połączony ranking, seedowanie "1 vs ostatni",
--    wolne losy tylko w rundzie 1 (bo bracket_size to najmniejsza potęga 2
--    >= liczby zakwalifikowanych drużyn).
create or replace function public.admin_generate_bracket(
  p_tournament_id uuid, p_teams_per_group integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_t_status text;
  v_seed_teams uuid[] := array[]::uuid[];
  v_n integer;
  v_bracket_size integer;
  v_total_rounds integer;
  v_i integer;
  v_low_seed integer;
  v_high_seed integer;
  v_team_a uuid;
  v_slots_in_round integer;
  v_j integer;
begin
  if v_actor is null or not public.is_app_admin() then return 'not_admin'; end if;

  select t.status into v_t_status from public.tournaments t where t.id = p_tournament_id;
  if not found then return 'not_found'; end if;
  if v_t_status <> 'in_progress' then return 'invalid_status'; end if;

  if exists (
    select 1 from public.tournament_playoff_matches m where m.tournament_id = p_tournament_id
  ) then
    return 'bracket_exists';
  end if;

  if exists (
    select 1 from public.tournament_matches m
    where m.tournament_id = p_tournament_id and m.status <> 'completed'
  ) then
    return 'group_stage_incomplete';
  end if;

  if p_teams_per_group is null or p_teams_per_group < 1 then return 'invalid_input'; end if;

  select coalesce(
    array_agg(s.team_id order by s.rank, s.points desc, s.point_diff desc, s.team_name),
    array[]::uuid[]
  )
    into v_seed_teams
    from public.get_tournament_standings(p_tournament_id) s
    where s.rank <= p_teams_per_group;

  v_n := coalesce(array_length(v_seed_teams, 1), 0);
  if v_n < 2 then return 'not_enough_qualified_teams'; end if;

  v_bracket_size := 1;
  while v_bracket_size < v_n loop
    v_bracket_size := v_bracket_size * 2;
  end loop;

  v_total_rounds := 0;
  v_i := v_bracket_size;
  while v_i > 1 loop
    v_i := v_i / 2;
    v_total_rounds := v_total_rounds + 1;
  end loop;

  -- Runda 1: seed i kontra seed (bracket_size + 1 - i). Gdy przeciwnik nie
  -- istnieje (seed > v_n) -> wolny los, drużyna awansuje od razu.
  for v_i in 1 .. (v_bracket_size / 2) loop
    v_low_seed := v_i;
    v_high_seed := v_bracket_size + 1 - v_i;
    v_team_a := v_seed_teams[v_low_seed];
    if v_high_seed <= v_n then
      insert into public.tournament_playoff_matches
        (tournament_id, round, slot, team_a_id, team_b_id, status)
      values
        (p_tournament_id, 1, v_i, v_team_a, v_seed_teams[v_high_seed], 'scheduled');
    else
      insert into public.tournament_playoff_matches
        (tournament_id, round, slot, team_a_id, team_b_id, winner_team_id, status, completed_at)
      values
        (p_tournament_id, 1, v_i, v_team_a, null, v_team_a, 'completed', now());
    end if;
  end loop;

  -- Rundy 2..total_rounds: puste sloty "pending", czekające na zwycięzców.
  v_slots_in_round := v_bracket_size / 2;
  for v_j in 2 .. v_total_rounds loop
    v_slots_in_round := v_slots_in_round / 2;
    for v_i in 1 .. v_slots_in_round loop
      insert into public.tournament_playoff_matches (tournament_id, round, slot, status)
      values (p_tournament_id, v_j, v_i, 'pending');
    end loop;
  end loop;

  -- Wolne losy z rundy 1 od razu awansują do rundy 2 (no-op jeśli total_rounds=1).
  update public.tournament_playoff_matches r2
    set team_a_id = case when r1.slot % 2 = 1 then r1.winner_team_id else r2.team_a_id end,
        team_b_id = case when r1.slot % 2 = 0 then r1.winner_team_id else r2.team_b_id end
    from public.tournament_playoff_matches r1
    where r1.tournament_id = p_tournament_id and r1.round = 1 and r1.status = 'completed'
      and r2.tournament_id = p_tournament_id and r2.round = 2
      and r2.slot = ceil(r1.slot / 2.0);

  update public.tournament_playoff_matches
    set status = 'scheduled'
    where tournament_id = p_tournament_id and round = 2 and status = 'pending'
      and team_a_id is not null and team_b_id is not null;

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (v_actor, 'generate_bracket', 'tournament', p_tournament_id,
    jsonb_build_object('teams_per_group', p_teams_per_group, 'qualified_count', v_n, 'rounds', v_total_rounds));

  return 'ok';
end;
$$;

revoke all on function public.admin_generate_bracket(uuid, integer) from public;
grant execute on function public.admin_generate_bracket(uuid, integer) to authenticated;

-- 4) Wpisanie wyniku meczu drabinki + automatyczny awans zwycięzcy do
--    rodzica; jeśli to był finał (brak kolejnej rundy) -> ustawia champion_team_id.
--    Remisy nigdy niedozwolone (niezależnie od tournaments.allow_draws).
create or replace function public.admin_record_playoff_result(
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
  v_round integer;
  v_slot integer;
  v_status text;
  v_team_a uuid;
  v_team_b uuid;
  v_winner uuid;
  v_next_rows integer;
begin
  if v_actor is null or not public.is_app_admin() then return 'not_admin'; end if;

  select m.tournament_id, m.round, m.slot, m.status, m.team_a_id, m.team_b_id
    into v_tournament_id, v_round, v_slot, v_status, v_team_a, v_team_b
    from public.tournament_playoff_matches m where m.id = p_match_id;
  if not found then return 'not_found'; end if;
  if v_status <> 'scheduled' then return 'not_scheduled'; end if;

  if p_score_a is null or p_score_b is null or p_score_a < 0 or p_score_b < 0 then
    return 'invalid_input';
  end if;
  if p_score_a = p_score_b then return 'draws_not_allowed'; end if;

  v_winner := case when p_score_a > p_score_b then v_team_a else v_team_b end;

  update public.tournament_playoff_matches
    set score_a = p_score_a, score_b = p_score_b, winner_team_id = v_winner,
        status = 'completed', completed_at = now()
    where id = p_match_id;

  update public.tournament_playoff_matches nxt
    set team_a_id = case when v_slot % 2 = 1 then v_winner else nxt.team_a_id end,
        team_b_id = case when v_slot % 2 = 0 then v_winner else nxt.team_b_id end
    where nxt.tournament_id = v_tournament_id and nxt.round = v_round + 1
      and nxt.slot = ceil(v_slot / 2.0);
  get diagnostics v_next_rows = row_count;

  if v_next_rows = 0 then
    update public.tournaments set champion_team_id = v_winner where id = v_tournament_id;
  else
    update public.tournament_playoff_matches
      set status = 'scheduled'
      where tournament_id = v_tournament_id and round = v_round + 1
        and slot = ceil(v_slot / 2.0) and status = 'pending'
        and team_a_id is not null and team_b_id is not null;
  end if;

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (v_actor, 'record_playoff_result', 'tournament_playoff_match', p_match_id,
    jsonb_build_object('score_a', p_score_a, 'score_b', p_score_b, 'winner_team_id', v_winner));

  return 'ok';
end;
$$;

revoke all on function public.admin_record_playoff_result(uuid, integer, integer) from public;
grant execute on function public.admin_record_playoff_result(uuid, integer, integer) to authenticated;

-- 5) Odczyt drabinki (nazwy drużyn dołączone left joinem, bo sloty mogą
--    być jeszcze puste). Funkcja SQL (nie plpgsql) celowo — unika pułapki
--    z migracji 0074, gdzie nazwy kolumn RETURNS TABLE przesłaniały
--    identyczne nazwy kolumn w zapytaniach wewnątrz funkcji plpgsql.
create or replace function public.list_tournament_playoff_bracket(p_tournament_id uuid)
returns table (
  id uuid, round integer, slot integer,
  team_a_id uuid, team_a_name text, team_b_id uuid, team_b_name text,
  score_a integer, score_b integer, winner_team_id uuid, status text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id, m.round, m.slot,
    m.team_a_id, ta.name, m.team_b_id, tb.name,
    m.score_a, m.score_b, m.winner_team_id, m.status
  from public.tournament_playoff_matches m
  left join public.teams ta on ta.id = m.team_a_id
  left join public.teams tb on tb.id = m.team_b_id
  where m.tournament_id = p_tournament_id
  order by m.round, m.slot;
$$;

revoke all on function public.list_tournament_playoff_bracket(uuid) from public;
grant execute on function public.list_tournament_playoff_bracket(uuid) to authenticated;

notify pgrst, 'reload schema';
