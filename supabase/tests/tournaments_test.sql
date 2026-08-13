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
  v_draft_id uuid; v_cancelled_id uuid; v_geo_id uuid;
  v_lat double precision; v_lng double precision;
  v_rls_role_ok boolean := true;
  v_lifecycle_team_a uuid; v_lifecycle_team_b uuid;
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
    8, 2, 5, 0, false, 3, 1, 0, true
  );
  if v_status <> 'not_admin' then raise exception 'FAIL user cannot create, got %', v_status; end if;
  insert into _t values ('non-admin create blocked OK');

  -- 2) Admin tworzy turniej.
  -- players_per_team=1 celowo (nie 5) — krok 5 poniżej rejestruje 2 minimalne,
  -- jednoosobowe drużyny tylko po to, żeby spełnić min_teams=2 przy przejściu
  -- do 'ready' (wymagane od migracji 0073); ten test sprawdza stan maszyny
  -- cyklu życia turnieju, nie rozmiar drużyn (patrz tournament_teams_test.sql).
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select status, tournament_id into v_status, v_id from public.admin_create_tournament(
    'Test Cup', 'opis', null, 'basketball', current_date + 14, '10:00', null,
    null, now() + interval '7 days', null, null, null, null, null, null,
    8, 2, 1, 0, false, 3, 1, 0, true
  );
  if v_status <> 'ok' or v_id is null then raise exception 'FAIL admin create, got %', v_status; end if;
  -- Od migracji 0087 grupy NIE są już tworzone przy zakładaniu turnieju —
  -- to teraz robi segregator (admin_auto_organize_tournament) po zamknięciu
  -- zapisów. Sprawdzamy więc odwrotność dawnej asercji.
  select count(*) into v_group_count from public.tournament_groups where tournament_id = v_id;
  if v_group_count <> 0 then raise exception 'FAIL expected 0 groups at creation, got %', v_group_count; end if;
  insert into _t values ('admin create -> 0 groups at creation OK');

  -- 3) Nowy turniej ma status draft
  select status into v_status from public.tournaments where id = v_id;
  if v_status <> 'draft' then raise exception 'FAIL new tournament not draft, got %', v_status; end if;
  insert into _t values ('new tournament is draft OK');

  -- 4) Admin edytuje draft (zmienia max_teams)
  select public.admin_update_tournament(
    v_id, 'Test Cup', 'opis', null, 'basketball', current_date + 14, '10:00', null,
    null, now() + interval '7 days', null, null, null, null, null, null,
    16, 2, 1, 0, false, 3, 1, 0, true
  ) into v_status;
  if v_status <> 'ok' then raise exception 'FAIL update draft, got %', v_status; end if;
  if (select max_teams from public.tournaments where id = v_id) <> 16 then
    raise exception 'FAIL max_teams not persisted';
  end if;
  insert into _t values ('update draft OK');

  -- 5) Przejście przez cały cykl życia
  select public.admin_set_tournament_status(v_id, 'registration_open') into v_status;
  if v_status <> 'ok' then raise exception 'FAIL draft->registration_open, got %', v_status; end if;

  -- min_teams=2 jest wymagane przy przejściu do 'ready' (migracja 0073) —
  -- rejestrujemy i zatwierdzamy 2 minimalne (1-osobowe, players_per_team=1)
  -- drużyny, żeby cykl życia mógł ruszyć dalej.
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  insert into public.teams (name, sport, owner_id) values ('Lifecycle Test FC A', 'basketball', v_user)
  returning id into v_lifecycle_team_a;
  insert into public.team_members (team_id, user_id, role) values (v_lifecycle_team_a, v_user, 'owner');
  select public.register_team_for_tournament(v_id, v_lifecycle_team_a) into v_status;
  if v_status <> 'ok' then raise exception 'FAIL lifecycle team A register, got %', v_status; end if;

  insert into public.teams (name, sport, owner_id) values ('Lifecycle Test FC B', 'basketball', v_user)
  returning id into v_lifecycle_team_b;
  insert into public.team_members (team_id, user_id, role) values (v_lifecycle_team_b, v_user, 'owner');
  select public.register_team_for_tournament(v_id, v_lifecycle_team_b) into v_status;
  if v_status <> 'ok' then raise exception 'FAIL lifecycle team B register, got %', v_status; end if;

  -- requires_approval=false na tym turnieju -> obie rejestracje trafiają od
  -- razu jako 'approved', nic do zatwierdzenia przez admina.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  insert into _t values ('lifecycle teams registered (auto-approved, requires_approval=false) OK');

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
    16, 2, 5, 0, false, 3, 1, 0, true
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
    4, 2, 5, 0, false, 3, 1, 0, true
  );
  if v_status <> 'ok' or v_id is null then raise exception 'FAIL draft create, got %', v_status; end if;
  v_draft_id := v_id; -- zachowane do testu list_tournaments (krok 12) — v_id jest reużywane dalej
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

  -- 11) Fixture: turniej anulowany (do testu widoczności list_tournaments, krok 12)
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select status, tournament_id into v_status, v_cancelled_id from public.admin_create_tournament(
    'Cancelled Cup', null, null, 'basketball', current_date + 30, '10:00', null,
    null, now() + interval '7 days', null, null, null, null, null, null,
    8, 2, 5, 0, false, 3, 1, 0, true
  );
  if v_status <> 'ok' or v_cancelled_id is null then
    raise exception 'FAIL cancelled fixture create, got %', v_status;
  end if;
  select public.admin_set_tournament_status(v_cancelled_id, 'registration_open') into v_status;
  if v_status <> 'ok' then raise exception 'FAIL cancelled fixture ->registration_open, got %', v_status; end if;
  select public.admin_set_tournament_status(v_cancelled_id, 'cancelled') into v_status;
  if v_status <> 'ok' then raise exception 'FAIL cancelled fixture ->cancelled, got %', v_status; end if;
  insert into _t values ('cancelled fixture created OK');

  -- 12) list_tournaments(null, false) (widok publiczny) musi wykluczać draft i cancelled
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  if exists (select 1 from public.list_tournaments(null, false, 50, 0) where id = v_draft_id) then
    raise exception 'FAIL list_tournaments(false) leaks draft tournament (%).', v_draft_id;
  end if;
  if exists (select 1 from public.list_tournaments(null, false, 50, 0) where id = v_cancelled_id) then
    raise exception 'FAIL list_tournaments(false) leaks cancelled tournament (%).', v_cancelled_id;
  end if;
  insert into _t values ('list_tournaments(null,false) excludes draft+cancelled OK');

  -- 13) latitude/longitude (migracja 0072) round-trip przez list_tournaments
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select status, tournament_id into v_status, v_geo_id from public.admin_create_tournament(
    'Geo Cup', null, null, 'basketball', current_date + 40, '10:00', null,
    null, now() + interval '7 days', 'Hala Warszawa', null, 'Warszawa', 52.2297, 21.0122, null,
    8, 2, 5, 0, false, 3, 1, 0, true
  );
  if v_status <> 'ok' or v_geo_id is null then raise exception 'FAIL geo fixture create, got %', v_status; end if;
  select latitude, longitude into v_lat, v_lng
    from public.list_tournaments(null, true, 50, 0)
    where id = v_geo_id;
  if v_lat is distinct from 52.2297::double precision or v_lng is distinct from 21.0122::double precision then
    raise exception 'FAIL lat/lng round-trip via list_tournaments, got % / %', v_lat, v_lng;
  end if;
  insert into _t values ('lat/lng round-trip via list_tournaments OK');

  -- 14) (opcjonalny) RLS jako defense-in-depth: surowy SELECT spoza RPC nie może
  --     zwrócić draftu zwykłemu userowi. Przełączamy ROLE na 'authenticated' (bez
  --     bypassrls), bo skrypt jest zwykle odpalany jako superuser 'postgres',
  --     który i tak omija RLS niezależnie od polityk.
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  begin
    set local role authenticated;
  exception when others then
    v_rls_role_ok := false;
  end;
  if v_rls_role_ok then
    -- Poza tym begin/exception, żeby prawdziwa regresja RLS (wiersz widoczny)
    -- realnie wywaliła cały test przez 'raise exception', a nie została połknięta
    -- jako "sprawdzenie pominięte".
    select count(*) into v_group_count from public.tournaments where status = 'draft';
    reset role;
    if v_group_count > 0 then
      raise exception 'FAIL RLS: raw select as non-admin returned % draft row(s)', v_group_count;
    end if;
    insert into _t values ('RLS blocks raw draft select for non-admin OK');
  else
    insert into _t values ('RLS raw-select check skipped (SET LOCAL ROLE authenticated not permitted here)');
  end if;

  -- Fikcyjne turnieje z tego pliku celowo NIE są sprzątane (pre-istniejący
  -- stan tego testu) — ale fikcyjne DRUŻYNY dodane w kroku 5 są widoczne w
  -- ogólnej liście drużyn całej appki, więc te akurat sprzątamy.
  delete from public.team_members where team_id in (v_lifecycle_team_a, v_lifecycle_team_b);
  delete from public.teams where id in (v_lifecycle_team_a, v_lifecycle_team_b);

  raise notice 'Wszystkie testy turniejów zaliczone: %', (select string_agg(step, ', ') from _t);
end;
$$;

select * from _t;
