-- ============================================================================
-- Mecze fazy grupowej i tabela (standings) — testy funkcjonalne backendu.
-- Uruchamiaj na środowisku testowym/stagingu, jako postgres w SQL Editor.
-- Wymaga: co najmniej 1 profil admin/super_admin, 1 profil user (manager).
-- Tworzy własne fikcyjne turnieje/drużyny/mecze, sprząta po sobie.
-- Grupa A (3 drużyny, cykl 1-0/1-0/1-0): pełny remis 3-drożynowy ->
--   spadek do sortowania po nazwie (udokumentowane ograniczenie).
-- Grupa B (4 drużyny): M1/M2 remisują punktowo i różnicą, ale mecz
--   bezpośredni M1-M2 rozstrzygnięty (3-0) -> head-to-head łamie remis.
--   M4 nie rozgrywa żadnego meczu -> musi pojawić się w tabeli z samymi zerami.
--   M5 zaakceptowana, ale nieprzypisana do grupy -> brak w terminarzu/tabeli.
-- ============================================================================

create temp table _t(step text) on commit drop;
do $$
declare
  v_admin uuid; v_manager uuid;
  v_tournament_id uuid; v_draw_tournament_id uuid;
  v_group_a uuid; v_group_b uuid;
  v_a1 uuid; v_a2 uuid; v_a3 uuid;
  v_m1 uuid; v_m2 uuid; v_m3 uuid; v_m4 uuid; v_m5 uuid;
  v_d1 uuid; v_d2 uuid;
  v_status text;
  v_match_id uuid; v_ta uuid;
  v_draw_group_id uuid;
  v_count integer;
  v_rank integer; v_points integer; v_diff integer; v_played integer;
begin
  select id into v_admin from public.profiles where role in ('admin', 'super_admin') order by created_at limit 1;
  select id into v_manager from public.profiles where role = 'user' order by created_at limit 1;
  if v_admin is null or v_manager is null then
    raise exception 'Potrzebny co najmniej 1 profil admin/super_admin i 1 profil user';
  end if;

  -- ==========================================================================
  -- Turniej główny: 2 grupy, 8 drużyn (7 rozegranych + 1 nieprzypisana)
  -- ==========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  -- players_per_team=1 celowo (nie 5) — wszystkie fikcyjne drużyny w tym
  -- pliku mają dokładnie 1 członka (właściciela); egzekwowanie rozmiaru
  -- drużyny (migracja 0086) jest testowane osobno w tournament_teams_test.sql.
  select status, tournament_id into v_status, v_tournament_id from public.admin_create_tournament(
    'Matches Test Cup', null, null, 'basketball', current_date + 14, '10:00', null,
    null, now() + interval '7 days', null, null, null, null, null, null,
    8, 7, 1, 0, false, 3, 1, 0, false, array['Grupa A', 'Grupa B']
  );
  if v_status <> 'ok' or v_tournament_id is null then raise exception 'FAIL tournament fixture create, got %', v_status; end if;
  select id into v_group_a from public.tournament_groups where tournament_id = v_tournament_id order by sort_order limit 1;
  select id into v_group_b from public.tournament_groups where tournament_id = v_tournament_id order by sort_order offset 1 limit 1;
  insert into _t values ('fixture: tournament (requires_approval=false, allow_draws=false, min=7/max=8) created OK');

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select public.admin_set_tournament_status(v_tournament_id, 'registration_open') into v_status;
  if v_status <> 'ok' then raise exception 'FAIL open registration, got %', v_status; end if;

  -- 8 drużyn, wszystkie zarządzane przez v_manager, alfabetyczne nazwy w Grupie A
  perform set_config('request.jwt.claims', json_build_object('sub', v_manager, 'role', 'authenticated')::text, true);
  insert into public.teams (name, sport, owner_id) values ('Alpha Test GA', 'basketball', v_manager) returning id into v_a1;
  insert into public.team_members (team_id, user_id, role) values (v_a1, v_manager, 'owner');
  insert into public.teams (name, sport, owner_id) values ('Bravo Test GA', 'basketball', v_manager) returning id into v_a2;
  insert into public.team_members (team_id, user_id, role) values (v_a2, v_manager, 'owner');
  insert into public.teams (name, sport, owner_id) values ('Charlie Test GA', 'basketball', v_manager) returning id into v_a3;
  insert into public.team_members (team_id, user_id, role) values (v_a3, v_manager, 'owner');
  insert into public.teams (name, sport, owner_id) values ('Mike One GB', 'basketball', v_manager) returning id into v_m1;
  insert into public.team_members (team_id, user_id, role) values (v_m1, v_manager, 'owner');
  insert into public.teams (name, sport, owner_id) values ('Mike Two GB', 'basketball', v_manager) returning id into v_m2;
  insert into public.team_members (team_id, user_id, role) values (v_m2, v_manager, 'owner');
  insert into public.teams (name, sport, owner_id) values ('Mike Three GB', 'basketball', v_manager) returning id into v_m3;
  insert into public.team_members (team_id, user_id, role) values (v_m3, v_manager, 'owner');
  insert into public.teams (name, sport, owner_id) values ('Mike Four GB', 'basketball', v_manager) returning id into v_m4;
  insert into public.team_members (team_id, user_id, role) values (v_m4, v_manager, 'owner');
  insert into public.teams (name, sport, owner_id) values ('Mike Five GB', 'basketball', v_manager) returning id into v_m5;
  insert into public.team_members (team_id, user_id, role) values (v_m5, v_manager, 'owner');
  insert into _t values ('fixture: 8 teams created OK');

  -- requires_approval=false -> rejestracja od razu 'approved'
  perform public.register_team_for_tournament(v_tournament_id, v_a1);
  perform public.register_team_for_tournament(v_tournament_id, v_a2);
  perform public.register_team_for_tournament(v_tournament_id, v_a3);
  perform public.register_team_for_tournament(v_tournament_id, v_m1);
  perform public.register_team_for_tournament(v_tournament_id, v_m2);
  perform public.register_team_for_tournament(v_tournament_id, v_m3);
  perform public.register_team_for_tournament(v_tournament_id, v_m4);
  perform public.register_team_for_tournament(v_tournament_id, v_m5);

  select count(*) into v_count from public.tournament_teams
    where tournament_id = v_tournament_id and status = 'approved';
  if v_count <> 8 then raise exception 'FAIL expected 8 approved teams, got %', v_count; end if;
  insert into _t values ('8 teams auto-approved (requires_approval=false) OK');

  -- Przypisanie do grup: A1-A3 -> Grupa A; M1-M4 -> Grupa B; M5 celowo bez grupy
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  update public.tournament_teams set group_id = v_group_a where tournament_id = v_tournament_id and team_id in (v_a1, v_a2, v_a3);
  update public.tournament_teams set group_id = v_group_b where tournament_id = v_tournament_id and team_id in (v_m1, v_m2, v_m3, v_m4);
  insert into _t values ('teams assigned to groups (M5 left unassigned) OK');

  -- ==========================================================================
  -- Brak meczów przed 'ready'; przejście registration_closed -> ready generuje terminarz
  -- ==========================================================================
  select count(*) into v_count from public.tournament_matches where tournament_id = v_tournament_id;
  if v_count <> 0 then raise exception 'FAIL expected 0 matches before ready, got %', v_count; end if;

  select public.admin_set_tournament_status(v_tournament_id, 'registration_closed') into v_status;
  if v_status <> 'ok' then raise exception 'FAIL close registration, got %', v_status; end if;
  select public.admin_set_tournament_status(v_tournament_id, 'ready') into v_status;
  if v_status <> 'ok' then raise exception 'FAIL ready transition, got %', v_status; end if;

  -- Grupa A: C(3,2)=3 mecze. Grupa B: C(4,2)=6 mecze. M5 bez grupy -> 0. Razem 9.
  select count(*) into v_count from public.tournament_matches where tournament_id = v_tournament_id;
  if v_count <> 9 then raise exception 'FAIL expected 9 auto-generated matches (3+6), got %', v_count; end if;
  insert into _t values ('ready transition auto-generated 9 round-robin matches (3+6) OK');

  -- Ponowne wywołanie generatora jest idempotentne (on conflict do nothing)
  perform public.admin_generate_group_matches(v_tournament_id);
  select count(*) into v_count from public.tournament_matches where tournament_id = v_tournament_id;
  if v_count <> 9 then raise exception 'FAIL re-generation duplicated matches, got %', v_count; end if;
  insert into _t values ('re-running admin_generate_group_matches is idempotent OK');

  -- M5 (nieprzypisana) nie ma żadnego meczu
  if exists (select 1 from public.tournament_matches where tournament_id = v_tournament_id and (team_a_id = v_m5 or team_b_id = v_m5)) then
    raise exception 'FAIL unassigned team M5 got a match';
  end if;
  insert into _t values ('unassigned team (group_id null) got zero matches OK');

  -- ==========================================================================
  -- Wpisywanie wyników — Grupa A: cykl 1-0 (A1>A2, A2>A3, A3>A1) -> pełny remis 3-drużynowy
  -- ==========================================================================
  select id, team_a_id into v_match_id, v_ta from public.tournament_matches
    where group_id = v_group_a and ((team_a_id = v_a1 and team_b_id = v_a2) or (team_a_id = v_a2 and team_b_id = v_a1));
  if v_ta = v_a1 then perform public.admin_record_match_result(v_match_id, 1, 0); else perform public.admin_record_match_result(v_match_id, 0, 1); end if;

  select id, team_a_id into v_match_id, v_ta from public.tournament_matches
    where group_id = v_group_a and ((team_a_id = v_a2 and team_b_id = v_a3) or (team_a_id = v_a3 and team_b_id = v_a2));
  if v_ta = v_a2 then perform public.admin_record_match_result(v_match_id, 1, 0); else perform public.admin_record_match_result(v_match_id, 0, 1); end if;

  select id, team_a_id into v_match_id, v_ta from public.tournament_matches
    where group_id = v_group_a and ((team_a_id = v_a3 and team_b_id = v_a1) or (team_a_id = v_a1 and team_b_id = v_a3));
  if v_ta = v_a3 then perform public.admin_record_match_result(v_match_id, 1, 0); else perform public.admin_record_match_result(v_match_id, 0, 1); end if;
  insert into _t values ('Group A: 3 cyclic 1-0 results recorded OK');

  -- ==========================================================================
  -- Grupa B: M1 bije M2 3-0; M2 bije M3 5-0; M3 bije M1 1-0 (M1/M2 lądują
  -- na identycznych punktach+różnicy; M3 osobno na tych samych punktach, innej
  -- różnicy; M4 nie gra wcale)
  -- ==========================================================================
  select id, team_a_id into v_match_id, v_ta from public.tournament_matches
    where group_id = v_group_b and ((team_a_id = v_m1 and team_b_id = v_m2) or (team_a_id = v_m2 and team_b_id = v_m1));
  if v_ta = v_m1 then perform public.admin_record_match_result(v_match_id, 3, 0); else perform public.admin_record_match_result(v_match_id, 0, 3); end if;

  select id, team_a_id into v_match_id, v_ta from public.tournament_matches
    where group_id = v_group_b and ((team_a_id = v_m2 and team_b_id = v_m3) or (team_a_id = v_m3 and team_b_id = v_m2));
  if v_ta = v_m2 then perform public.admin_record_match_result(v_match_id, 5, 0); else perform public.admin_record_match_result(v_match_id, 0, 5); end if;

  select id, team_a_id into v_match_id, v_ta from public.tournament_matches
    where group_id = v_group_b and ((team_a_id = v_m3 and team_b_id = v_m1) or (team_a_id = v_m1 and team_b_id = v_m3));
  if v_ta = v_m3 then perform public.admin_record_match_result(v_match_id, 1, 0); else perform public.admin_record_match_result(v_match_id, 0, 1); end if;
  insert into _t values ('Group B: 3 of 6 results recorded (M1/M2/M3 played each other; M4 untouched) OK');

  -- ==========================================================================
  -- get_tournament_standings — assercje
  -- ==========================================================================

  -- Grupa A: pełny 3-drużynowy remis (punkty=3, różnica=0 dla wszystkich) -> alfabetycznie
  select rank into v_rank from public.get_tournament_standings(v_tournament_id) where team_id = v_a1;
  if v_rank <> 1 then raise exception 'FAIL Group A 3-way tie: Alpha expected rank 1, got %', v_rank; end if;
  select rank into v_rank from public.get_tournament_standings(v_tournament_id) where team_id = v_a2;
  if v_rank <> 2 then raise exception 'FAIL Group A 3-way tie: Bravo expected rank 2, got %', v_rank; end if;
  select rank into v_rank from public.get_tournament_standings(v_tournament_id) where team_id = v_a3;
  if v_rank <> 3 then raise exception 'FAIL Group A 3-way tie: Charlie expected rank 3, got %', v_rank; end if;
  insert into _t values ('Group A 3-way full tie falls back to alphabetical name order OK');

  -- Grupa B: M1/M2 dzielą punkty(3)+różnicę(+2), ale M1 wygrał bezpośredni pojedynek 3-0 -> M1 przed M2
  select points, point_diff, rank into v_points, v_diff, v_rank from public.get_tournament_standings(v_tournament_id) where team_id = v_m1;
  if v_points <> 3 or v_diff <> 2 or v_rank <> 1 then
    raise exception 'FAIL M1 expected points=3 diff=2 rank=1, got points=% diff=% rank=%', v_points, v_diff, v_rank;
  end if;
  select points, point_diff, rank into v_points, v_diff, v_rank from public.get_tournament_standings(v_tournament_id) where team_id = v_m2;
  if v_points <> 3 or v_diff <> 2 or v_rank <> 2 then
    raise exception 'FAIL M2 expected points=3 diff=2 rank=2, got points=% diff=% rank=%', v_points, v_diff, v_rank;
  end if;
  insert into _t values ('Group B tied pair (equal points+diff) broken by head-to-head result OK');

  select points, point_diff, rank into v_points, v_diff, v_rank from public.get_tournament_standings(v_tournament_id) where team_id = v_m3;
  if v_points <> 3 or v_diff <> -4 or v_rank <> 3 then
    raise exception 'FAIL M3 expected points=3 diff=-4 rank=3, got points=% diff=% rank=%', v_points, v_diff, v_rank;
  end if;
  insert into _t values ('Group B non-tied third team ranked purely by diff OK');

  -- M4 nie rozegrał żadnego meczu -> musi wystąpić w tabeli z samymi zerami
  select played, points, point_diff, rank into v_played, v_points, v_diff, v_rank
    from public.get_tournament_standings(v_tournament_id) where team_id = v_m4;
  if v_played <> 0 or v_points <> 0 or v_diff <> 0 or v_rank <> 4 then
    raise exception 'FAIL M4 (0 played) expected played=0 points=0 diff=0 rank=4, got played=% points=% diff=% rank=%', v_played, v_points, v_diff, v_rank;
  end if;
  insert into _t values ('team with 0 played matches still appears in standings (all zeros) OK');

  -- M5 (nieprzypisana do grupy) nie występuje w tabeli w ogóle
  if exists (select 1 from public.get_tournament_standings(v_tournament_id) where team_id = v_m5) then
    raise exception 'FAIL unassigned team M5 appeared in standings';
  end if;
  insert into _t values ('unassigned team absent from standings OK');

  -- ==========================================================================
  -- admin_reset_match: cofa mecz do 'scheduled', znika z liczenia
  -- ==========================================================================
  select id into v_match_id from public.tournament_matches
    where group_id = v_group_a and ((team_a_id = v_a1 and team_b_id = v_a2) or (team_a_id = v_a2 and team_b_id = v_a1));
  select public.admin_reset_match(v_match_id) into v_status;
  if v_status <> 'ok' then raise exception 'FAIL admin_reset_match, got %', v_status; end if;

  select status into v_status from public.tournament_matches where id = v_match_id;
  if v_status <> 'scheduled' then raise exception 'FAIL match not reset to scheduled, got %', v_status; end if;

  select played into v_played from public.get_tournament_standings(v_tournament_id) where team_id = v_a1;
  if v_played <> 1 then raise exception 'FAIL A1 played expected to drop to 1 after reset, got %', v_played; end if;
  insert into _t values ('admin_reset_match clears result and standings recompute (played 2 -> 1) OK');

  -- invalid_input: wynik ujemny
  select id into v_match_id from public.tournament_matches
    where group_id = v_group_a and ((team_a_id = v_a1 and team_b_id = v_a2) or (team_a_id = v_a2 and team_b_id = v_a1));
  select public.admin_record_match_result(v_match_id, -1, 0) into v_status;
  if v_status <> 'invalid_input' then raise exception 'FAIL negative score expected invalid_input, got %', v_status; end if;
  insert into _t values ('negative score rejected as invalid_input OK');

  -- ==========================================================================
  -- Osobny mały turniej allow_draws=false: test draws_not_allowed
  -- ==========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select status, tournament_id into v_status, v_draw_tournament_id from public.admin_create_tournament(
    'Draws Test Cup', null, null, 'basketball', current_date + 14, '10:00', null,
    null, now() + interval '7 days', null, null, null, null, null, null,
    2, 2, 1, 0, false, 3, 1, 0, false, array['Solo Group']
  );
  if v_status <> 'ok' then raise exception 'FAIL draw-test tournament create, got %', v_status; end if;
  select id into v_draw_group_id from public.tournament_groups where tournament_id = v_draw_tournament_id limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_manager, 'role', 'authenticated')::text, true);
  insert into public.teams (name, sport, owner_id) values ('Draw Team One', 'basketball', v_manager) returning id into v_d1;
  insert into public.team_members (team_id, user_id, role) values (v_d1, v_manager, 'owner');
  insert into public.teams (name, sport, owner_id) values ('Draw Team Two', 'basketball', v_manager) returning id into v_d2;
  insert into public.team_members (team_id, user_id, role) values (v_d2, v_manager, 'owner');

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select public.admin_set_tournament_status(v_draw_tournament_id, 'registration_open') into v_status;
  perform set_config('request.jwt.claims', json_build_object('sub', v_manager, 'role', 'authenticated')::text, true);
  perform public.register_team_for_tournament(v_draw_tournament_id, v_d1);
  perform public.register_team_for_tournament(v_draw_tournament_id, v_d2);

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  update public.tournament_teams set group_id = v_draw_group_id
    where tournament_id = v_draw_tournament_id and team_id in (v_d1, v_d2);
  select public.admin_set_tournament_status(v_draw_tournament_id, 'registration_closed') into v_status;
  select public.admin_set_tournament_status(v_draw_tournament_id, 'ready') into v_status;
  if v_status <> 'ok' then raise exception 'FAIL draw-test ready transition, got %', v_status; end if;

  select id into v_match_id from public.tournament_matches where tournament_id = v_draw_tournament_id;
  select public.admin_record_match_result(v_match_id, 2, 2) into v_status;
  if v_status <> 'draws_not_allowed' then raise exception 'FAIL expected draws_not_allowed, got %', v_status; end if;
  insert into _t values ('equal score rejected as draws_not_allowed when allow_draws=false OK');

  select public.admin_record_match_result(v_match_id, 3, 2) into v_status;
  if v_status <> 'ok' then raise exception 'FAIL valid decisive score should succeed, got %', v_status; end if;
  insert into _t values ('decisive (non-drawn) score accepted OK');

  -- list_tournament_matches sanity: nazwy drużyn i grupy dołączone poprawnie
  if not exists (
    select 1 from public.list_tournament_matches(v_tournament_id)
    where group_name = 'Grupa A' and team_a_name in ('Alpha Test GA','Bravo Test GA','Charlie Test GA')
  ) then
    raise exception 'FAIL list_tournament_matches missing expected Group A row with names joined';
  end if;
  insert into _t values ('list_tournament_matches joins team/group names correctly OK');

  -- ==========================================================================
  -- Sprzątanie
  -- ==========================================================================
  delete from public.tournament_matches where tournament_id in (v_tournament_id, v_draw_tournament_id);
  delete from public.tournament_teams where tournament_id in (v_tournament_id, v_draw_tournament_id);
  delete from public.tournament_groups where tournament_id in (v_tournament_id, v_draw_tournament_id);
  delete from public.tournaments where id in (v_tournament_id, v_draw_tournament_id);
  delete from public.team_members where team_id in (v_a1, v_a2, v_a3, v_m1, v_m2, v_m3, v_m4, v_m5, v_d1, v_d2);
  delete from public.teams where id in (v_a1, v_a2, v_a3, v_m1, v_m2, v_m3, v_m4, v_m5, v_d1, v_d2);

  select count(*) into v_count from public.tournament_matches where tournament_id in (v_tournament_id, v_draw_tournament_id);
  if v_count <> 0 then raise exception 'FAIL cleanup left % leftover match rows', v_count; end if;
  insert into _t values ('fixture cleanup OK, 0 leftover match rows confirmed');

  raise notice 'Wszystkie testy meczów/tabeli zaliczone: %', (select string_agg(step, ', ') from _t);
end;
$$;

select * from _t;
