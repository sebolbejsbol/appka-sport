-- ============================================================================
-- Rejestracja drużyn na turniej — testy funkcjonalne backendu (asercje PL/pgSQL).
-- Uruchamiaj na środowisku testowym/stagingu, jako postgres w SQL Editor.
-- Wymaga: co najmniej 1 profil admin/super_admin, 2 profile user (manager i outsider).
-- Tworzy własne fikcyjne turnieje/drużyny, żeby nie zależeć od przypadkowych danych.
-- Pełne przejście = brak wyjątku; tabela _t na końcu zawiera zaliczone kroki.
-- Sprząta po sobie wszystkie fikcyjne dane.
-- ============================================================================

create temp table _t(step text) on commit drop;
do $$
declare
  v_admin uuid; v_manager uuid; v_outsider uuid;
  v_tournament_id uuid;
  v_team_id uuid; v_wrongsport_team_id uuid; v_second_team_id uuid; v_third_team_id uuid;
  v_reject_team_id uuid; v_remove_team_id uuid;
  v_status text; v_reg_id uuid; v_second_reg_id uuid; v_group_id uuid;
  v_reject_reg_id uuid; v_remove_reg_id uuid;
  v_size_tournament_id uuid; v_size_team_id uuid;
begin
  select id into v_admin from public.profiles where role in ('admin', 'super_admin') order by created_at limit 1;
  select id into v_manager from public.profiles where role = 'user' order by created_at limit 1;
  select id into v_outsider from public.profiles where role = 'user' order by created_at offset 1 limit 1;
  if v_admin is null or v_manager is null or v_outsider is null then
    raise exception 'Potrzebny co najmniej 1 profil admin/super_admin i 2 profile user';
  end if;

  -- Fikcyjna drużyna zarządzana przez v_manager
  insert into public.teams (name, sport, owner_id) values ('Test Registration FC', 'basketball', v_manager)
  returning id into v_team_id;
  insert into public.team_members (team_id, user_id, role) values (v_team_id, v_manager, 'owner');
  insert into _t values ('fixture: manager team created OK');

  -- Druga fikcyjna drużyna, złego sportu (do testu wrong_sport), też v_manager
  insert into public.teams (name, sport, owner_id) values ('Test Registration Volley', 'volleyball', v_manager)
  returning id into v_wrongsport_team_id;
  insert into public.team_members (team_id, user_id, role) values (v_wrongsport_team_id, v_manager, 'owner');

  -- Fikcyjny turniej koszykarski, max_teams=2, min_teams=2, 2 grupy.
  -- players_per_team=1 celowo (nie 5) — każda fikcyjna drużyna w tym pliku ma
  -- dokładnie 1 członka (właściciela); ten test sprawdza flow rejestracji/
  -- akceptacji, nie egzekwowanie rozmiaru drużyny (patrz osobny blok niżej).
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select status, tournament_id into v_status, v_tournament_id from public.admin_create_tournament(
    'Registration Test Cup', null, null, 'basketball', current_date + 14, '10:00', null,
    null, now() + interval '7 days', null, null, null, null, null, null,
    2, 2, 1, 0, true, 3, 1, 0, true
  );
  if v_status <> 'ok' or v_tournament_id is null then raise exception 'FAIL tournament fixture create, got %', v_status; end if;
  -- Grupy nie są już tworzone przez admin_create_tournament (0087) — segregator
  -- tworzy je automatycznie po zamknięciu zapisów. Ten test wciąż sprawdza
  -- admin_assign_team_group bezpośrednio (funkcjonalność niezmieniona), więc
  -- zasiewamy grupy ręcznie, tak jak wcześniej robił to admin_create_tournament.
  insert into public.tournament_groups (tournament_id, name, sort_order) values
    (v_tournament_id, 'Grupa A', 0), (v_tournament_id, 'Grupa B', 1);
  select id into v_group_id from public.tournament_groups where tournament_id = v_tournament_id order by sort_order limit 1;
  insert into _t values ('fixture: tournament (max_teams=2, min_teams=2, requires_approval) created OK');

  -- 1) Nie-manager nie może zarejestrować cudzej drużyny
  perform set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
  select public.register_team_for_tournament(v_tournament_id, v_team_id) into v_status;
  if v_status <> 'not_team_manager' then raise exception 'FAIL non-manager register blocked, got %', v_status; end if;
  insert into _t values ('non-manager register blocked OK');

  -- 2) Rejestracja przed otwarciem zapisów (turniej wciąż 'draft') -> not_open
  perform set_config('request.jwt.claims', json_build_object('sub', v_manager, 'role', 'authenticated')::text, true);
  select public.register_team_for_tournament(v_tournament_id, v_team_id) into v_status;
  if v_status <> 'not_open' then raise exception 'FAIL register before open blocked, got %', v_status; end if;
  insert into _t values ('register before registration_open blocked OK');

  -- Otwarcie zapisów
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select public.admin_set_tournament_status(v_tournament_id, 'registration_open') into v_status;
  if v_status <> 'ok' then raise exception 'FAIL open registration, got %', v_status; end if;

  -- 3) Zły sport -> wrong_sport
  perform set_config('request.jwt.claims', json_build_object('sub', v_manager, 'role', 'authenticated')::text, true);
  select public.register_team_for_tournament(v_tournament_id, v_wrongsport_team_id) into v_status;
  if v_status <> 'wrong_sport' then raise exception 'FAIL wrong sport blocked, got %', v_status; end if;
  insert into _t values ('wrong-sport register blocked OK');

  -- 4) Rejestracja poprawnej drużyny -> pending (requires_approval=true)
  select public.register_team_for_tournament(v_tournament_id, v_team_id) into v_status;
  if v_status <> 'ok' then raise exception 'FAIL register team, got %', v_status; end if;
  select id, status into v_reg_id, v_status from public.tournament_teams
    where tournament_id = v_tournament_id and team_id = v_team_id;
  if v_status <> 'pending' then raise exception 'FAIL expected pending, got %', v_status; end if;
  insert into _t values ('register team -> pending OK');

  -- 5) Powtórna rejestracja podczas pending -> already_registered
  select public.register_team_for_tournament(v_tournament_id, v_team_id) into v_status;
  if v_status <> 'already_registered' then raise exception 'FAIL duplicate register blocked, got %', v_status; end if;
  insert into _t values ('duplicate register while pending blocked OK');

  -- 6) get_my_team_registration_status zwraca 'pending'
  select public.get_my_team_registration_status(v_tournament_id, v_team_id) into v_status;
  if v_status <> 'pending' then raise exception 'FAIL get_my_team_registration_status, got %', v_status; end if;
  insert into _t values ('get_my_team_registration_status pending OK');

  -- 7) Nie-admin nie może zaakceptować
  perform set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
  select public.admin_respond_team_registration(v_reg_id, true) into v_status;
  if v_status <> 'not_admin' then raise exception 'FAIL non-admin approve blocked, got %', v_status; end if;
  insert into _t values ('non-admin approve blocked OK');

  -- 8) list_tournament_team_registrations (widok publiczny) nie pokazuje pending
  if exists (select 1 from public.list_tournament_team_registrations(v_tournament_id, false) where id = v_reg_id) then
    raise exception 'FAIL public list leaks pending registration';
  end if;
  insert into _t values ('public list excludes pending OK');

  -- 9) Admin akceptuje -> approved
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select public.admin_respond_team_registration(v_reg_id, true) into v_status;
  if v_status <> 'ok' then raise exception 'FAIL admin approve, got %', v_status; end if;
  select status into v_status from public.tournament_teams where id = v_reg_id;
  if v_status <> 'approved' then raise exception 'FAIL expected approved, got %', v_status; end if;
  insert into _t values ('admin approve -> approved OK');

  -- 10) list_tournament_team_registrations (widok publiczny) teraz pokazuje drużynę
  if not exists (select 1 from public.list_tournament_team_registrations(v_tournament_id, false) where id = v_reg_id) then
    raise exception 'FAIL public list missing approved registration';
  end if;
  insert into _t values ('public list includes approved OK');

  -- 11) Powtórna odpowiedź na już rozpatrzone zgłoszenie -> not_pending
  select public.admin_respond_team_registration(v_reg_id, true) into v_status;
  if v_status <> 'not_pending' then raise exception 'FAIL re-respond blocked, got %', v_status; end if;
  insert into _t values ('re-respond to resolved registration blocked OK');

  -- 12) Przypisanie do grupy
  select public.admin_assign_team_group(v_reg_id, v_group_id) into v_status;
  if v_status <> 'ok' then raise exception 'FAIL assign group, got %', v_status; end if;
  if (select group_id from public.tournament_teams where id = v_reg_id) is distinct from v_group_id then
    raise exception 'FAIL group_id not persisted correctly';
  end if;
  insert into _t values ('assign team to group OK');

  -- 13) Odrzucenie zgłoszenia (druga, tymczasowa drużyna) — testuje gałąź p_accept=false
  perform set_config('request.jwt.claims', json_build_object('sub', v_manager, 'role', 'authenticated')::text, true);
  insert into public.teams (name, sport, owner_id) values ('Test Registration Reject', 'basketball', v_manager)
  returning id into v_reject_team_id;
  insert into public.team_members (team_id, user_id, role) values (v_reject_team_id, v_manager, 'owner');

  select public.register_team_for_tournament(v_tournament_id, v_reject_team_id) into v_status;
  if v_status <> 'ok' then raise exception 'FAIL reject-fixture team register, got %', v_status; end if;
  select id into v_reject_reg_id from public.tournament_teams
    where tournament_id = v_tournament_id and team_id = v_reject_team_id;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select public.admin_respond_team_registration(v_reject_reg_id, false) into v_status;
  if v_status <> 'ok' then raise exception 'FAIL reject registration, got %', v_status; end if;
  select status into v_status from public.tournament_teams where id = v_reject_reg_id;
  if v_status <> 'rejected' then raise exception 'FAIL expected rejected, got %', v_status; end if;
  insert into _t values ('admin reject -> rejected OK');

  -- 14) Usunięcie już zaakceptowanej drużyny (trzecia, tymczasowa drużyna) —
  --     testuje admin_remove_team_registration; podnosi liczbę approved do 2/2
  --     na chwilę, po czym usunięcie sprowadza ją z powrotem do 1/2, więc
  --     dalsze kroki (min_teams=2) nadal widzą tylko v_team_id jako approved.
  perform set_config('request.jwt.claims', json_build_object('sub', v_manager, 'role', 'authenticated')::text, true);
  insert into public.teams (name, sport, owner_id) values ('Test Registration Remove', 'basketball', v_manager)
  returning id into v_remove_team_id;
  insert into public.team_members (team_id, user_id, role) values (v_remove_team_id, v_manager, 'owner');

  select public.register_team_for_tournament(v_tournament_id, v_remove_team_id) into v_status;
  if v_status <> 'ok' then raise exception 'FAIL remove-fixture team register, got %', v_status; end if;
  select id into v_remove_reg_id from public.tournament_teams
    where tournament_id = v_tournament_id and team_id = v_remove_team_id;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select public.admin_respond_team_registration(v_remove_reg_id, true) into v_status;
  if v_status <> 'ok' then raise exception 'FAIL remove-fixture team approve, got %', v_status; end if;

  select public.admin_remove_team_registration(v_remove_reg_id) into v_status;
  if v_status <> 'ok' then raise exception 'FAIL admin_remove_team_registration, got %', v_status; end if;
  select status into v_status from public.tournament_teams where id = v_remove_reg_id;
  if v_status <> 'rejected' then raise exception 'FAIL expected rejected after remove, got %', v_status; end if;
  insert into _t values ('admin_remove_team_registration -> rejected OK');

  -- 15) close -> ready zablokowane, dopóki nie ma min_teams (min_teams=2, tylko 1 approved: v_team_id)
  select public.admin_set_tournament_status(v_tournament_id, 'registration_closed') into v_status;
  if v_status <> 'ok' then raise exception 'FAIL close registration, got %', v_status; end if;

  select public.admin_set_tournament_status(v_tournament_id, 'ready') into v_status;
  if v_status <> 'not_enough_teams' then raise exception 'FAIL ready blocked below min_teams, got %', v_status; end if;
  insert into _t values ('ready transition blocked below min_teams OK');

  -- 16) Reopen (registration_closed -> registration_open jest legalne), rejestrujemy i
  --     zatwierdzamy drugą drużynę, docierając do 2/2 approved (turniej wciąż otwarty)
  perform set_config('request.jwt.claims', json_build_object('sub', v_manager, 'role', 'authenticated')::text, true);
  select public.admin_set_tournament_status(v_tournament_id, 'registration_open') into v_status;
  if v_status <> 'not_admin' then raise exception 'FAIL non-admin reopen blocked, got %', v_status; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select public.admin_set_tournament_status(v_tournament_id, 'registration_open') into v_status;
  if v_status <> 'ok' then raise exception 'FAIL reopen registration, got %', v_status; end if;

  insert into public.teams (name, sport, owner_id) values ('Test Registration FC 2', 'basketball', v_outsider)
  returning id into v_second_team_id;
  insert into public.team_members (team_id, user_id, role) values (v_second_team_id, v_outsider, 'owner');

  perform set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
  select public.register_team_for_tournament(v_tournament_id, v_second_team_id) into v_status;
  if v_status <> 'ok' then raise exception 'FAIL second team register, got %', v_status; end if;
  select id into v_second_reg_id from public.tournament_teams
    where tournament_id = v_tournament_id and team_id = v_second_team_id;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select public.admin_respond_team_registration(v_second_reg_id, true) into v_status;
  if v_status <> 'ok' then raise exception 'FAIL second team approve, got %', v_status; end if;
  insert into _t values ('second team registered and approved (2/2), tournament still registration_open OK');

  -- 17) tournament_full: turniej ma już 2/2 approved (max_teams=2), wciąż registration_open —
  --     trzecia drużyna nie może dołączyć
  insert into public.teams (name, sport, owner_id) values ('Test Registration FC 3', 'basketball', v_outsider)
  returning id into v_third_team_id;
  insert into public.team_members (team_id, user_id, role) values (v_third_team_id, v_outsider, 'owner');

  perform set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
  select public.register_team_for_tournament(v_tournament_id, v_third_team_id) into v_status;
  if v_status <> 'tournament_full' then raise exception 'FAIL tournament_full not enforced, got %', v_status; end if;
  insert into _t values ('tournament_full enforced at registration (2/2 approved) OK');

  -- 18) Wycofanie nigdy niezarejestrowanej drużyny -> not_registered
  select public.withdraw_team_registration(v_tournament_id, v_third_team_id) into v_status;
  if v_status <> 'not_registered' then raise exception 'FAIL withdraw of never-registered team, got %', v_status; end if;
  insert into _t values ('withdraw of never-registered team returns not_registered OK');

  -- 19) Teraz zamykamy zapisy i przechodzimy do ready — 2/2 approved spełnia min_teams=2
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select public.admin_set_tournament_status(v_tournament_id, 'registration_closed') into v_status;
  if v_status <> 'ok' then raise exception 'FAIL close registration (2), got %', v_status; end if;
  select public.admin_set_tournament_status(v_tournament_id, 'ready') into v_status;
  if v_status <> 'ok' then raise exception 'FAIL ready transition once min_teams met, got %', v_status; end if;
  insert into _t values ('ready transition succeeds once min_teams met (2/2) OK');

  -- 20) Wycofanie zaakceptowanej drużyny (dozwolone nawet po 'ready' — patrz design doc)
  perform set_config('request.jwt.claims', json_build_object('sub', v_manager, 'role', 'authenticated')::text, true);
  select public.withdraw_team_registration(v_tournament_id, v_team_id) into v_status;
  if v_status <> 'ok' then raise exception 'FAIL withdraw approved team, got %', v_status; end if;
  select status into v_status from public.tournament_teams
    where tournament_id = v_tournament_id and team_id = v_team_id;
  if v_status <> 'withdrawn' then raise exception 'FAIL expected withdrawn, got %', v_status; end if;
  insert into _t values ('withdraw approved team -> withdrawn OK');

  -- 21) team_too_small: nowy, osobny turniej z players_per_team=2 — drużyna
  --     z 1 członkiem nie może się zarejestrować; po dobraniu drugiego
  --     członka rejestracja się udaje. Zamierzenie 0086: wcześniej rozmiar
  --     drużyny nie był w ogóle sprawdzany.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select status, tournament_id into v_status, v_size_tournament_id from public.admin_create_tournament(
    'Registration Size Test Cup', null, null, 'basketball', current_date + 14, '10:00', null,
    null, now() + interval '7 days', null, null, null, null, null, null,
    4, 2, 2, 0, false, 3, 1, 0, true
  );
  if v_status <> 'ok' or v_size_tournament_id is null then
    raise exception 'FAIL size-test tournament fixture create, got %', v_status;
  end if;
  select public.admin_set_tournament_status(v_size_tournament_id, 'registration_open') into v_status;
  if v_status <> 'ok' then raise exception 'FAIL open size-test registration, got %', v_status; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_manager, 'role', 'authenticated')::text, true);
  insert into public.teams (name, sport, owner_id) values ('Test Registration Size', 'basketball', v_manager)
  returning id into v_size_team_id;
  insert into public.team_members (team_id, user_id, role) values (v_size_team_id, v_manager, 'owner');

  select public.register_team_for_tournament(v_size_tournament_id, v_size_team_id) into v_status;
  if v_status <> 'team_too_small' then
    raise exception 'FAIL team_too_small not enforced (1 member, needs 2), got %', v_status;
  end if;
  insert into _t values ('team_too_small enforced at registration OK');

  insert into public.team_members (team_id, user_id, role) values (v_size_team_id, v_outsider, 'member');
  select public.register_team_for_tournament(v_size_tournament_id, v_size_team_id) into v_status;
  if v_status <> 'ok' then
    raise exception 'FAIL register once team meets players_per_team, got %', v_status;
  end if;
  insert into _t values ('register succeeds once team meets players_per_team (2/2 members) OK');

  -- Sprzątanie fikcyjnych danych
  delete from public.tournament_teams where tournament_id in (v_tournament_id, v_size_tournament_id);
  delete from public.tournament_groups where tournament_id in (v_tournament_id, v_size_tournament_id);
  delete from public.tournaments where id in (v_tournament_id, v_size_tournament_id);
  delete from public.team_members where team_id in (
    v_team_id, v_wrongsport_team_id, v_second_team_id, v_third_team_id, v_reject_team_id, v_remove_team_id,
    v_size_team_id
  );
  delete from public.teams where id in (
    v_team_id, v_wrongsport_team_id, v_second_team_id, v_third_team_id, v_reject_team_id, v_remove_team_id,
    v_size_team_id
  );
  insert into _t values ('fixture cleanup OK');

  raise notice 'Wszystkie testy rejestracji drużyn zaliczone: %', (select string_agg(step, ', ') from _t);
end;
$$;

select * from _t;