-- ============================================================================
-- Automatyczny segregator drużyn (migracja 0087) — testy funkcjonalne backendu.
-- Uruchamiaj na środowisku testowym/stagingu, jako postgres w SQL Editor.
-- Wymaga: co najmniej 1 profil admin/super_admin, 1 profil user (manager).
-- Fixture A: 5 zaakceptowanych drużyn (<=8) -> od razu drabinka pucharowa,
--   bez fazy grupowej (bracket_size=8, 3 wolne losy w rundzie 1).
-- Fixture B: 17 zaakceptowanych drużyn (>8) -> ceil(17/8)=3 grupy, rozdział
--   "po kolei" daje rozmiary {6,6,5} niezależnie od losowej kolejności.
-- Fixture C: 1 zaakceptowana drużyna, min_teams=2 -> not_enough_teams.
-- Tworzy własne fikcyjne turnieje/drużyny, sprząta po sobie (w tym wpisy
-- admin_audit_log, żeby nie zaśmiecać prawdziwego logu testowymi wpisami).
-- ============================================================================

create temp table _t(step text) on commit drop;
do $$
declare
  v_admin uuid; v_manager uuid; v_user2 uuid;
  v_status text;
  v_direct_id uuid; v_groups_id uuid; v_small_id uuid;
  v_team_id uuid;
  v_i integer;
  v_group_count integer;
  v_bye_count integer; v_scheduled_count integer;
  v_match_count integer;
  v_sizes integer[];
  v_direct_teams uuid[] := array[]::uuid[];
  v_groups_teams uuid[] := array[]::uuid[];
begin
  select id into v_admin from public.profiles where role in ('admin', 'super_admin') order by created_at limit 1;
  select id into v_manager from public.profiles where role = 'user' order by created_at limit 1;
  select id into v_user2 from public.profiles where role = 'user' order by created_at offset 1 limit 1;
  if v_admin is null or v_manager is null then
    raise exception 'Potrzebny co najmniej 1 profil admin/super_admin i 1 profil user';
  end if;
  if v_user2 is null then v_user2 := v_manager; end if;

  -- ==========================================================================
  -- Fixture A: 5 drużyn (<=8) -> segregator idzie od razu do drabinki
  -- ==========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select status, tournament_id into v_status, v_direct_id from public.admin_create_tournament(
    'Auto Organize Direct Cup', null, null, 'basketball', current_date + 14, '10:00', null,
    null, now() + interval '7 days', null, null, null, null, null, null,
    8, 2, 1, 0, false, 3, 1, 0, true
  );
  if v_status <> 'ok' or v_direct_id is null then raise exception 'FAIL direct-cup create, got %', v_status; end if;

  -- 1) Segregator odmawia poza registration_closed
  select public.admin_auto_organize_tournament(v_direct_id) into v_status;
  if v_status <> 'invalid_status' then raise exception 'FAIL organize while draft expected invalid_status, got %', v_status; end if;
  insert into _t values ('organize blocked while draft (invalid_status) OK');

  select public.admin_set_tournament_status(v_direct_id, 'registration_open') into v_status;
  if v_status <> 'ok' then raise exception 'FAIL direct-cup open registration, got %', v_status; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_manager, 'role', 'authenticated')::text, true);
  for v_i in 1 .. 5 loop
    insert into public.teams (name, sport, owner_id)
      values ('Auto Direct Team ' || v_i, 'basketball', v_manager) returning id into v_team_id;
    insert into public.team_members (team_id, user_id, role) values (v_team_id, v_manager, 'owner');
    perform public.register_team_for_tournament(v_direct_id, v_team_id);
    v_direct_teams := array_append(v_direct_teams, v_team_id);
  end loop;
  insert into _t values ('fixture A: 5 teams registered and auto-approved OK');

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select public.admin_set_tournament_status(v_direct_id, 'registration_closed') into v_status;
  if v_status <> 'ok' then raise exception 'FAIL direct-cup close registration, got %', v_status; end if;

  -- 2) Nie-admin nie może segregować
  perform set_config('request.jwt.claims', json_build_object('sub', v_manager, 'role', 'authenticated')::text, true);
  select public.admin_auto_organize_tournament(v_direct_id) into v_status;
  if v_status <> 'not_admin' then raise exception 'FAIL non-admin organize blocked, got %', v_status; end if;
  insert into _t values ('non-admin organize blocked OK');

  -- 3) Segregacja: <=8 drużyn -> brak grup, od razu drabinka, status in_progress
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select public.admin_auto_organize_tournament(v_direct_id) into v_status;
  if v_status <> 'ok' then raise exception 'FAIL organize direct-cup, got %', v_status; end if;

  select count(*) into v_group_count from public.tournament_groups where tournament_id = v_direct_id;
  if v_group_count <> 0 then raise exception 'FAIL direct path should create 0 groups, got %', v_group_count; end if;

  select status into v_status from public.tournaments where id = v_direct_id;
  if v_status <> 'in_progress' then raise exception 'FAIL direct path should end at in_progress, got %', v_status; end if;

  select count(*) into v_bye_count from public.tournament_playoff_matches
    where tournament_id = v_direct_id and round = 1 and status = 'completed' and team_b_id is null;
  select count(*) into v_scheduled_count from public.tournament_playoff_matches
    where tournament_id = v_direct_id and round = 1 and status = 'scheduled';
  if v_bye_count <> 3 or v_scheduled_count <> 1 then
    raise exception 'FAIL expected 3 byes + 1 scheduled in round 1 (5 teams, bracket_size=8), got % byes / % scheduled', v_bye_count, v_scheduled_count;
  end if;
  insert into _t values ('fixture A: direct bracket generated (0 groups, 3 byes + 1 scheduled, in_progress) OK');

  -- 4) Druga segregacja tego samego turnieju: status już przeszedł na
  --    in_progress, więc kolejne wywołanie odbija się o zwykły status guard.
  select public.admin_auto_organize_tournament(v_direct_id) into v_status;
  if v_status <> 'invalid_status' then raise exception 'FAIL re-organize expected invalid_status, got %', v_status; end if;
  insert into _t values ('re-organize blocked (status no longer registration_closed) OK');

  -- ==========================================================================
  -- Fixture B: 17 drużyn (>8) -> ceil(17/8)=3 grupy, rozmiary {6,6,5}
  -- ==========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select status, tournament_id into v_status, v_groups_id from public.admin_create_tournament(
    'Auto Organize Groups Cup', null, null, 'basketball', current_date + 14, '10:00', null,
    null, now() + interval '7 days', null, null, null, null, null, null,
    20, 2, 1, 0, false, 3, 1, 0, true
  );
  if v_status <> 'ok' or v_groups_id is null then raise exception 'FAIL groups-cup create, got %', v_status; end if;
  select public.admin_set_tournament_status(v_groups_id, 'registration_open') into v_status;
  if v_status <> 'ok' then raise exception 'FAIL groups-cup open registration, got %', v_status; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_manager, 'role', 'authenticated')::text, true);
  for v_i in 1 .. 17 loop
    insert into public.teams (name, sport, owner_id)
      values ('Auto Group Team ' || v_i, 'basketball', v_manager) returning id into v_team_id;
    insert into public.team_members (team_id, user_id, role) values (v_team_id, v_manager, 'owner');
    perform public.register_team_for_tournament(v_groups_id, v_team_id);
    v_groups_teams := array_append(v_groups_teams, v_team_id);
  end loop;
  insert into _t values ('fixture B: 17 teams registered and auto-approved OK');

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select public.admin_set_tournament_status(v_groups_id, 'registration_closed') into v_status;
  if v_status <> 'ok' then raise exception 'FAIL groups-cup close registration, got %', v_status; end if;

  select public.admin_auto_organize_tournament(v_groups_id) into v_status;
  if v_status <> 'ok' then raise exception 'FAIL organize groups-cup, got %', v_status; end if;

  select count(*) into v_group_count from public.tournament_groups where tournament_id = v_groups_id;
  if v_group_count <> 3 then raise exception 'FAIL expected ceil(17/8)=3 groups, got %', v_group_count; end if;

  select status into v_status from public.tournaments where id = v_groups_id;
  if v_status <> 'ready' then raise exception 'FAIL groups path should end at ready, got %', v_status; end if;

  select array_agg(cnt order by cnt) into v_sizes
    from (
      select count(*) as cnt from public.tournament_teams
      where tournament_id = v_groups_id and status = 'approved'
      group by group_id
    ) s;
  if v_sizes <> array[5, 6, 6] then
    raise exception 'FAIL expected group sizes {5,6,6}, got %', v_sizes;
  end if;
  insert into _t values ('fixture B: 3 groups created with sizes {5,6,6} OK');

  select count(*) into v_match_count from public.tournament_matches where tournament_id = v_groups_id;
  -- C(6,2)+C(6,2)+C(5,2) = 15+15+10 = 40
  if v_match_count <> 40 then
    raise exception 'FAIL expected 40 round-robin matches (C(6,2)+C(6,2)+C(5,2)), got %', v_match_count;
  end if;
  insert into _t values ('fixture B: round-robin schedule generated (40 matches) OK');

  select count(*) into v_group_count from public.tournament_playoff_matches where tournament_id = v_groups_id;
  if v_group_count <> 0 then raise exception 'FAIL groups path should not generate a bracket yet, got %', v_group_count; end if;
  insert into _t values ('fixture B: no bracket generated yet (group stage not played) OK');

  -- ==========================================================================
  -- Fixture C: 1 zaakceptowana drużyna, min_teams=2 -> not_enough_teams
  -- ==========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select status, tournament_id into v_status, v_small_id from public.admin_create_tournament(
    'Auto Organize Too Small Cup', null, null, 'basketball', current_date + 14, '10:00', null,
    null, now() + interval '7 days', null, null, null, null, null, null,
    8, 2, 1, 0, false, 3, 1, 0, true
  );
  if v_status <> 'ok' or v_small_id is null then raise exception 'FAIL small-cup create, got %', v_status; end if;
  select public.admin_set_tournament_status(v_small_id, 'registration_open') into v_status;
  if v_status <> 'ok' then raise exception 'FAIL small-cup open registration, got %', v_status; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_manager, 'role', 'authenticated')::text, true);
  insert into public.teams (name, sport, owner_id) values ('Auto Small Team 1', 'basketball', v_manager)
    returning id into v_team_id;
  insert into public.team_members (team_id, user_id, role) values (v_team_id, v_manager, 'owner');
  perform public.register_team_for_tournament(v_small_id, v_team_id);

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select public.admin_set_tournament_status(v_small_id, 'registration_closed') into v_status;
  if v_status <> 'ok' then raise exception 'FAIL small-cup close registration, got %', v_status; end if;

  select public.admin_auto_organize_tournament(v_small_id) into v_status;
  if v_status <> 'not_enough_teams' then raise exception 'FAIL organize below min_teams expected not_enough_teams, got %', v_status; end if;
  insert into _t values ('organize blocked below min_teams (not_enough_teams) OK');

  -- ==========================================================================
  -- Sprzątanie
  -- ==========================================================================
  delete from public.tournament_playoff_matches where tournament_id in (v_direct_id, v_groups_id, v_small_id);
  delete from public.tournament_matches where tournament_id in (v_direct_id, v_groups_id, v_small_id);
  delete from public.tournament_teams where tournament_id in (v_direct_id, v_groups_id, v_small_id);
  delete from public.tournament_groups where tournament_id in (v_direct_id, v_groups_id, v_small_id);
  delete from public.admin_audit_log where entity_id in (v_direct_id, v_groups_id, v_small_id);
  delete from public.tournaments where id in (v_direct_id, v_groups_id, v_small_id);
  delete from public.team_members where team_id = any(v_direct_teams || v_groups_teams || array[v_team_id]);
  delete from public.teams where id = any(v_direct_teams || v_groups_teams || array[v_team_id]);
  insert into _t values ('fixture cleanup OK');

  raise notice 'Wszystkie testy automatycznego segregatora zaliczone: %', (select string_agg(step, ', ') from _t);
end;
$$;

select * from _t;
