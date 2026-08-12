-- ============================================================================
-- Drabinka play-off — testy funkcjonalne backendu (asercje PL/pgSQL).
-- Uruchamiaj na środowisku testowym/stagingu, jako postgres w SQL Editor.
-- Wymaga: co najmniej 1 profil admin/super_admin, 1 profil user (manager).
-- Fikcyjny turniej: Grupa A (P1,P2,P3, jasna kolejność 1/2/3),
-- Grupa B (Q1,Q2, jasna kolejność 1/2). teams_per_group=3 -> kwalifikuje
-- się wszystkie 5 drużyn. Połączony ranking: seed1=P1(6pkt), seed2=Q1(3pkt),
-- seed3=P2(3pkt,diff0), seed4=Q2(0pkt), seed5=P3(0pkt,diff-6).
-- bracket_size=8 -> 3 wolne losy w rundzie 1 (P1,Q1,P2), 1 realny mecz
-- (Q2 vs P3), 3 rundy łącznie (finał = runda 3).
-- allow_draws=true na tym turnieju celowo — sprawdza, że mecze play-off
-- i tak nigdy nie dopuszczają remisu.
-- ============================================================================

create temp table _t(step text) on commit drop;
do $$
declare
  v_admin uuid; v_manager uuid;
  v_tournament_id uuid;
  v_group_a uuid; v_group_b uuid;
  v_p1 uuid; v_p2 uuid; v_p3 uuid; v_q1 uuid; v_q2 uuid;
  v_status text;
  v_match_id uuid; v_ta uuid;
  v_count integer;
  v_round1_slot4_id uuid;
  v_round2_slot1_id uuid; v_round2_slot2_id uuid;
  v_final_id uuid;
  v_team_a uuid; v_team_b uuid; v_champion uuid;
begin
  select id into v_admin from public.profiles where role in ('admin', 'super_admin') order by created_at limit 1;
  select id into v_manager from public.profiles where role = 'user' order by created_at limit 1;
  if v_admin is null or v_manager is null then
    raise exception 'Potrzebny co najmniej 1 profil admin/super_admin i 1 profil user';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select status, tournament_id into v_status, v_tournament_id from public.admin_create_tournament(
    'Playoff Test Cup', null, null, 'basketball', current_date + 14, '10:00', null,
    null, now() + interval '7 days', null, null, null, null, null, null,
    5, 5, 5, 0, false, 3, 1, 0, true, array['Grupa A', 'Grupa B']
  );
  if v_status <> 'ok' or v_tournament_id is null then raise exception 'FAIL tournament fixture create, got %', v_status; end if;
  select id into v_group_a from public.tournament_groups where tournament_id = v_tournament_id order by sort_order limit 1;
  select id into v_group_b from public.tournament_groups where tournament_id = v_tournament_id order by sort_order offset 1 limit 1;
  insert into _t values ('fixture: tournament (5/5 teams, allow_draws=true) created OK');

  -- 1) admin_generate_bracket przed 'in_progress' -> invalid_status
  select public.admin_generate_bracket(v_tournament_id, 3) into v_status;
  if v_status <> 'invalid_status' then raise exception 'FAIL generate before in_progress expected invalid_status, got %', v_status; end if;
  insert into _t values ('admin_generate_bracket blocked before in_progress (invalid_status) OK');

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select public.admin_set_tournament_status(v_tournament_id, 'registration_open') into v_status;
  if v_status <> 'ok' then raise exception 'FAIL open registration, got %', v_status; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_manager, 'role', 'authenticated')::text, true);
  insert into public.teams (name, sport, owner_id) values ('Playoff P1', 'basketball', v_manager) returning id into v_p1;
  insert into public.team_members (team_id, user_id, role) values (v_p1, v_manager, 'owner');
  insert into public.teams (name, sport, owner_id) values ('Playoff P2', 'basketball', v_manager) returning id into v_p2;
  insert into public.team_members (team_id, user_id, role) values (v_p2, v_manager, 'owner');
  insert into public.teams (name, sport, owner_id) values ('Playoff P3', 'basketball', v_manager) returning id into v_p3;
  insert into public.team_members (team_id, user_id, role) values (v_p3, v_manager, 'owner');
  insert into public.teams (name, sport, owner_id) values ('Playoff Q1', 'basketball', v_manager) returning id into v_q1;
  insert into public.team_members (team_id, user_id, role) values (v_q1, v_manager, 'owner');
  insert into public.teams (name, sport, owner_id) values ('Playoff Q2', 'basketball', v_manager) returning id into v_q2;
  insert into public.team_members (team_id, user_id, role) values (v_q2, v_manager, 'owner');

  perform public.register_team_for_tournament(v_tournament_id, v_p1);
  perform public.register_team_for_tournament(v_tournament_id, v_p2);
  perform public.register_team_for_tournament(v_tournament_id, v_p3);
  perform public.register_team_for_tournament(v_tournament_id, v_q1);
  perform public.register_team_for_tournament(v_tournament_id, v_q2);
  insert into _t values ('fixture: 5 teams created and auto-approved OK');

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  update public.tournament_teams set group_id = v_group_a where tournament_id = v_tournament_id and team_id in (v_p1, v_p2, v_p3);
  update public.tournament_teams set group_id = v_group_b where tournament_id = v_tournament_id and team_id in (v_q1, v_q2);

  select public.admin_set_tournament_status(v_tournament_id, 'registration_closed') into v_status;
  if v_status <> 'ok' then raise exception 'FAIL close registration, got %', v_status; end if;
  select public.admin_set_tournament_status(v_tournament_id, 'ready') into v_status;
  if v_status <> 'ok' then raise exception 'FAIL ready transition, got %', v_status; end if;
  insert into _t values ('teams grouped, ready transition auto-generated group matches OK');

  -- 2) admin_generate_bracket przy 'ready' (jeszcze nie in_progress) -> invalid_status
  select public.admin_generate_bracket(v_tournament_id, 3) into v_status;
  if v_status <> 'invalid_status' then raise exception 'FAIL generate at ready expected invalid_status, got %', v_status; end if;

  select public.admin_set_tournament_status(v_tournament_id, 'in_progress') into v_status;
  if v_status <> 'ok' then raise exception 'FAIL in_progress transition, got %', v_status; end if;

  -- 3) admin_generate_bracket z niedokończoną fazą grupową -> group_stage_incomplete
  select public.admin_generate_bracket(v_tournament_id, 3) into v_status;
  if v_status <> 'group_stage_incomplete' then raise exception 'FAIL generate with incomplete group stage expected group_stage_incomplete, got %', v_status; end if;
  insert into _t values ('admin_generate_bracket blocked until group stage complete OK');

  -- Rozegranie fazy grupowej: Grupa A P1>P2>P3 (P1 2W, P2 1W1L, P3 2L),
  -- Grupa B Q1>Q2 (Q1 1W, Q2 1L)
  select id, team_a_id into v_match_id, v_ta from public.tournament_matches
    where group_id = v_group_a and ((team_a_id = v_p1 and team_b_id = v_p2) or (team_a_id = v_p2 and team_b_id = v_p1));
  if v_ta = v_p1 then perform public.admin_record_match_result(v_match_id, 3, 0); else perform public.admin_record_match_result(v_match_id, 0, 3); end if;

  select id, team_a_id into v_match_id, v_ta from public.tournament_matches
    where group_id = v_group_a and ((team_a_id = v_p1 and team_b_id = v_p3) or (team_a_id = v_p3 and team_b_id = v_p1));
  if v_ta = v_p1 then perform public.admin_record_match_result(v_match_id, 3, 0); else perform public.admin_record_match_result(v_match_id, 0, 3); end if;

  select id, team_a_id into v_match_id, v_ta from public.tournament_matches
    where group_id = v_group_a and ((team_a_id = v_p2 and team_b_id = v_p3) or (team_a_id = v_p3 and team_b_id = v_p2));
  if v_ta = v_p2 then perform public.admin_record_match_result(v_match_id, 3, 0); else perform public.admin_record_match_result(v_match_id, 0, 3); end if;

  select id, team_a_id into v_match_id, v_ta from public.tournament_matches
    where group_id = v_group_b and ((team_a_id = v_q1 and team_b_id = v_q2) or (team_a_id = v_q2 and team_b_id = v_q1));
  if v_ta = v_q1 then perform public.admin_record_match_result(v_match_id, 2, 0); else perform public.admin_record_match_result(v_match_id, 0, 2); end if;
  insert into _t values ('group stage fully played (P1>P2>P3, Q1>Q2) OK');

  -- 4) invalid_input: teams_per_group < 1
  select public.admin_generate_bracket(v_tournament_id, 0) into v_status;
  if v_status <> 'invalid_input' then raise exception 'FAIL teams_per_group=0 expected invalid_input, got %', v_status; end if;

  -- 5) Wygenerowanie drabinki
  select public.admin_generate_bracket(v_tournament_id, 3) into v_status;
  if v_status <> 'ok' then raise exception 'FAIL admin_generate_bracket, got %', v_status; end if;
  insert into _t values ('admin_generate_bracket -> ok OK');

  -- Ponowne wywołanie -> bracket_exists
  select public.admin_generate_bracket(v_tournament_id, 3) into v_status;
  if v_status <> 'bracket_exists' then raise exception 'FAIL re-generate expected bracket_exists, got %', v_status; end if;
  insert into _t values ('re-generating bracket blocked (bracket_exists) OK');

  -- Kształt rundy 1: 3 wolne losy (completed) + 1 realny mecz (scheduled)
  select count(*) into v_count from public.tournament_playoff_matches
    where tournament_id = v_tournament_id and round = 1 and status = 'completed' and team_b_id is null;
  if v_count <> 3 then raise exception 'FAIL expected 3 round-1 byes, got %', v_count; end if;

  select id into v_round1_slot4_id from public.tournament_playoff_matches
    where tournament_id = v_tournament_id and round = 1 and status = 'scheduled';
  if v_round1_slot4_id is null then raise exception 'FAIL expected exactly 1 scheduled round-1 match (Q2 vs P3)'; end if;
  insert into _t values ('round 1 shape: 3 byes + 1 real scheduled match OK');

  -- Kształt rundy 2: jeden slot już 'scheduled' (dwa wolne losy się zeszły:
  -- P1 vs Q1), drugi 'pending' (czeka na zwycięzcę realnego meczu)
  select id into v_round2_slot1_id from public.tournament_playoff_matches
    where tournament_id = v_tournament_id and round = 2 and status = 'scheduled';
  select id into v_round2_slot2_id from public.tournament_playoff_matches
    where tournament_id = v_tournament_id and round = 2 and status = 'pending';
  if v_round2_slot1_id is null or v_round2_slot2_id is null then
    raise exception 'FAIL expected round 2 with 1 scheduled + 1 pending slot';
  end if;
  insert into _t values ('round 2 shape: 1 scheduled (bye+bye) + 1 pending (waiting on round 1) OK');

  select id into v_final_id from public.tournament_playoff_matches
    where tournament_id = v_tournament_id and round = 3;
  if v_final_id is null then raise exception 'FAIL expected a round-3 final row'; end if;

  -- 6) Zapis wyniku na wciąż 'pending' meczu -> not_scheduled
  select public.admin_record_playoff_result(v_final_id, 1, 0) into v_status;
  if v_status <> 'not_scheduled' then raise exception 'FAIL recording pending match expected not_scheduled, got %', v_status; end if;
  insert into _t values ('recording result on pending (not yet scheduled) match blocked OK');

  -- 7) Remis zawsze zabroniony w play-off, mimo allow_draws=true na turnieju
  select public.admin_record_playoff_result(v_round1_slot4_id, 2, 2) into v_status;
  if v_status <> 'draws_not_allowed' then raise exception 'FAIL playoff draw expected draws_not_allowed (even with allow_draws=true), got %', v_status; end if;
  insert into _t values ('playoff draw rejected even though tournament allow_draws=true OK');

  select public.admin_record_playoff_result(v_round1_slot4_id, -1, 0) into v_status;
  if v_status <> 'invalid_input' then raise exception 'FAIL negative playoff score expected invalid_input, got %', v_status; end if;

  -- 8) Rozegranie realnego meczu 1. rundy (Q2 vs P3): P3 wygrywa -> kaskaduje
  --    do rundy 2 sloty 2 (parzysty slot 4 -> team_b), ten slot ma już
  --    team_a=P2 (z wolnego losu), więc powinien przejść na 'scheduled'
  select team_a_id, team_b_id into v_team_a, v_team_b from public.tournament_playoff_matches where id = v_round1_slot4_id;
  if v_team_a = v_p3 then
    select public.admin_record_playoff_result(v_round1_slot4_id, 3, 1) into v_status;
  else
    select public.admin_record_playoff_result(v_round1_slot4_id, 1, 3) into v_status;
  end if;
  if v_status <> 'ok' then raise exception 'FAIL record round1 real match, got %', v_status; end if;

  select status, team_a_id, team_b_id into v_status, v_team_a, v_team_b
    from public.tournament_playoff_matches where id = v_round2_slot2_id;
  if v_status <> 'scheduled' then raise exception 'FAIL round2 slot2 expected scheduled after real match, got %', v_status; end if;
  if v_p3 not in (v_team_a, v_team_b) then raise exception 'FAIL round2 slot2 should contain P3 (winner of round1 real match)'; end if;
  insert into _t values ('round1 real match result recorded, cascaded into round2 (now scheduled) OK');

  -- Ponowne wpisanie wyniku na już ukończonym meczu -> not_scheduled
  select public.admin_record_playoff_result(v_round1_slot4_id, 5, 0) into v_status;
  if v_status <> 'not_scheduled' then raise exception 'FAIL re-recording completed match expected not_scheduled, got %', v_status; end if;
  insert into _t values ('re-recording an already-completed match blocked OK');

  -- 9) Rozegranie rundy 2, slot 1 (P1 vs Q1): P1 wygrywa -> kaskaduje do
  --    finału jako team_a (slot 1 jest nieparzysty); finał zostaje 'pending'
  --    (druga strona wciąż nieznana)
  select team_a_id into v_team_a from public.tournament_playoff_matches where id = v_round2_slot1_id;
  if v_team_a = v_p1 then
    select public.admin_record_playoff_result(v_round2_slot1_id, 4, 1) into v_status;
  else
    select public.admin_record_playoff_result(v_round2_slot1_id, 1, 4) into v_status;
  end if;
  if v_status <> 'ok' then raise exception 'FAIL record round2 slot1, got %', v_status; end if;

  select status, team_a_id, team_b_id into v_status, v_team_a, v_team_b
    from public.tournament_playoff_matches where id = v_final_id;
  if v_status <> 'pending' then raise exception 'FAIL final expected still pending after only 1 semifinal, got %', v_status; end if;
  if v_p1 not in (v_team_a, v_team_b) then raise exception 'FAIL final should already contain P1'; end if;
  insert into _t values ('round2 slot1 result cascaded into final (still pending, 1 side known) OK');

  -- 10) Rozegranie rundy 2, slot 2 (P2 vs P3): P3 wygrywa -> kaskaduje do
  --     finału jako drugą stronę; finał przechodzi na 'scheduled'
  select team_a_id into v_team_a from public.tournament_playoff_matches where id = v_round2_slot2_id;
  if v_team_a = v_p3 then
    select public.admin_record_playoff_result(v_round2_slot2_id, 2, 1) into v_status;
  else
    select public.admin_record_playoff_result(v_round2_slot2_id, 1, 2) into v_status;
  end if;
  if v_status <> 'ok' then raise exception 'FAIL record round2 slot2, got %', v_status; end if;

  select status, team_a_id, team_b_id into v_status, v_team_a, v_team_b
    from public.tournament_playoff_matches where id = v_final_id;
  if v_status <> 'scheduled' then raise exception 'FAIL final expected scheduled once both semifinals done, got %', v_status; end if;
  if v_p1 not in (v_team_a, v_team_b) or v_p3 not in (v_team_a, v_team_b) then
    raise exception 'FAIL final should contain exactly P1 and P3';
  end if;
  insert into _t values ('round2 slot2 result cascaded into final (now scheduled, P1 vs P3) OK');

  -- 11) Finał: P1 wygrywa -> champion_team_id = P1, status turnieju NIE zmienia się
  select team_a_id into v_team_a from public.tournament_playoff_matches where id = v_final_id;
  if v_team_a = v_p1 then
    select public.admin_record_playoff_result(v_final_id, 3, 2) into v_status;
  else
    select public.admin_record_playoff_result(v_final_id, 2, 3) into v_status;
  end if;
  if v_status <> 'ok' then raise exception 'FAIL record final, got %', v_status; end if;

  select champion_team_id, status into v_champion, v_status from public.tournaments where id = v_tournament_id;
  if v_champion <> v_p1 then raise exception 'FAIL expected champion_team_id = P1, got %', v_champion; end if;
  if v_status <> 'in_progress' then raise exception 'FAIL tournament status should stay in_progress after final, got %', v_status; end if;
  insert into _t values ('final result sets champion_team_id=P1, tournament status unchanged (in_progress) OK');

  -- ==========================================================================
  -- Sprzątanie
  -- ==========================================================================
  delete from public.tournament_playoff_matches where tournament_id = v_tournament_id;
  delete from public.tournament_matches where tournament_id = v_tournament_id;
  delete from public.tournament_teams where tournament_id = v_tournament_id;
  delete from public.tournament_groups where tournament_id = v_tournament_id;
  delete from public.tournaments where id = v_tournament_id;
  delete from public.team_members where team_id in (v_p1, v_p2, v_p3, v_q1, v_q2);
  delete from public.teams where id in (v_p1, v_p2, v_p3, v_q1, v_q2);

  select count(*) into v_count from public.tournament_playoff_matches where tournament_id = v_tournament_id;
  if v_count <> 0 then raise exception 'FAIL cleanup left % leftover playoff match rows', v_count; end if;
  insert into _t values ('fixture cleanup OK, 0 leftover playoff match rows confirmed');

  raise notice 'Wszystkie testy drabinki play-off zaliczone: %', (select string_agg(step, ', ') from _t);
end;
$$;

select * from _t;
