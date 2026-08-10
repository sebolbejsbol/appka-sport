-- ============================================================================
-- Turnieje — testy funkcjonalne backendu (asercje PL/pgSQL).
-- Uruchamiaj na środowisku testowym/stagingu, jako postgres w SQL Editor.
-- Wymaga: co najmniej 1 profil admin/super_admin i 1 profil user.
-- Pełne przejście = brak wyjątku; tabela _t na końcu zawiera zaliczone kroki.
-- ============================================================================

create temp table _t(step text) on commit drop;
do $$
declare
  v_admin uuid; v_user uuid;
  v_status text; v_id uuid;
  v_group_count integer;
begin
  select id into v_admin from public.profiles where role in ('admin', 'super_admin') order by created_at limit 1;
  select id into v_user from public.profiles where role = 'user' order by created_at limit 1;
  if v_admin is null or v_user is null then
    raise exception 'Potrzebny co najmniej 1 profil admin/super_admin i 1 profil user';
  end if;

  -- 1) Zwykły user nie może utworzyć turnieju
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  select status into v_status from public.admin_create_tournament(
    'Test Cup', null, null, 'basketball', current_date + 14, '10:00', null,
    null, now() + interval '7 days', null, null, null, null, null, null,
    8, 2, 5, 0, false, 3, 1, 0, true, array['Grupa A', 'Grupa B']
  );
  if v_status <> 'not_admin' then raise exception 'FAIL user cannot create, got %', v_status; end if;
  insert into _t values ('non-admin create blocked OK');

  -- 2) Admin tworzy turniej z 2 grupami
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select status, tournament_id into v_status, v_id from public.admin_create_tournament(
    'Test Cup', 'opis', null, 'basketball', current_date + 14, '10:00', null,
    null, now() + interval '7 days', null, null, null, null, null, null,
    8, 2, 5, 0, false, 3, 1, 0, true, array['Grupa A', 'Grupa B']
  );
  if v_status <> 'ok' or v_id is null then raise exception 'FAIL admin create, got %', v_status; end if;
  select count(*) into v_group_count from public.tournament_groups where tournament_id = v_id;
  if v_group_count <> 2 then raise exception 'FAIL expected 2 groups, got %', v_group_count; end if;
  insert into _t values ('admin create + 2 groups OK');

  -- 3) Nowy turniej ma status draft
  select status into v_status from public.tournaments where id = v_id;
  if v_status <> 'draft' then raise exception 'FAIL new tournament not draft, got %', v_status; end if;
  insert into _t values ('new tournament is draft OK');

  -- 4) Admin edytuje draft (zmienia max_teams)
  select public.admin_update_tournament(
    v_id, 'Test Cup', 'opis', null, 'basketball', current_date + 14, '10:00', null,
    null, now() + interval '7 days', null, null, null, null, null, null,
    16, 2, 5, 0, false, 3, 1, 0, true, array['Grupa A', 'Grupa B']
  ) into v_status;
  if v_status <> 'ok' then raise exception 'FAIL update draft, got %', v_status; end if;
  if (select max_teams from public.tournaments where id = v_id) <> 16 then
    raise exception 'FAIL max_teams not persisted';
  end if;
  insert into _t values ('update draft OK');

  -- 5) Przejście przez cały cykl życia
  select public.admin_set_tournament_status(v_id, 'registration_open') into v_status;
  if v_status <> 'ok' then raise exception 'FAIL draft->registration_open, got %', v_status; end if;
  select public.admin_set_tournament_status(v_id, 'registration_closed') into v_status;
  if v_status <> 'ok' then raise exception 'FAIL ->registration_closed, got %', v_status; end if;
  select public.admin_set_tournament_status(v_id, 'ready') into v_status;
  if v_status <> 'ok' then raise exception 'FAIL ->ready, got %', v_status; end if;
  select public.admin_set_tournament_status(v_id, 'in_progress') into v_status;
  if v_status <> 'ok' then raise exception 'FAIL ->in_progress, got %', v_status; end if;
  select public.admin_set_tournament_status(v_id, 'completed') into v_status;
  if v_status <> 'ok' then raise exception 'FAIL ->completed, got %', v_status; end if;
  insert into _t values ('full lifecycle walk OK');

  -- 6) Nielegalne przejście z terminalnego stanu
  select public.admin_set_tournament_status(v_id, 'draft') into v_status;
  if v_status <> 'invalid_transition' then raise exception 'FAIL terminal state protected, got %', v_status; end if;
  insert into _t values ('illegal transition blocked OK');

  -- 7) Edycja zablokowana poza draft/registration_open ('locked')
  select public.admin_update_tournament(
    v_id, 'Test Cup', 'opis', null, 'basketball', current_date + 14, '10:00', null,
    null, now() + interval '7 days', null, null, null, null, null, null,
    16, 2, 5, 0, false, 3, 1, 0, true, array['Grupa A', 'Grupa B']
  ) into v_status;
  if v_status <> 'locked' then raise exception 'FAIL completed tournament not locked, got %', v_status; end if;
  insert into _t values ('completed tournament locked OK');

  -- 8) Zwykły user widzi opublikowany (nie-draft/cancelled) turniej przez RPC odczytu
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  if not exists (select 1 from public.get_tournament_detail(v_id)) then
    raise exception 'FAIL non-admin cannot see completed tournament';
  end if;
  insert into _t values ('non-admin sees published tournament OK');

  -- 9) Zwykły user NIE widzi draftu przez RPC odczytu
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select status, tournament_id into v_status, v_id from public.admin_create_tournament(
    'Draft Cup', null, null, 'football', current_date + 21, '09:00', null,
    null, now() + interval '10 days', null, null, null, null, null, null,
    4, 2, 5, 0, false, 3, 1, 0, true, array['Grupa A']
  );
  if v_status <> 'ok' or v_id is null then raise exception 'FAIL draft create, got %', v_status; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  if exists (select 1 from public.get_tournament_detail(v_id)) then
    raise exception 'FAIL non-admin can see draft tournament';
  end if;
  insert into _t values ('non-admin cannot see draft OK');

  -- 10) list_tournaments admin_view=true wymaga admina
  begin
    perform public.list_tournaments(null, true, 50, 0);
    raise exception 'FAIL admin_view should have raised for non-admin';
  exception when others then
    if sqlerrm <> 'not_admin' then raise exception 'FAIL wrong error for admin_view, got %', sqlerrm; end if;
  end;
  insert into _t values ('list_tournaments admin_view gated OK');

  raise notice 'Wszystkie testy turniejów zaliczone: %', (select string_agg(step, ', ') from _t);
end;
$$;

select * from _t;
