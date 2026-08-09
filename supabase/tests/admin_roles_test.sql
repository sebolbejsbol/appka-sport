-- ============================================================================
-- Role administracyjne — testy funkcjonalne backendu (asercje PL/pgSQL).
-- Uruchamiaj na środowisku testowym/stagingu, jako postgres w SQL Editor.
-- Wymaga: co najmniej 1 profil super_admin (migracja 0070) i 3 profile łącznie.
-- Pełne przejście = brak wyjątku; tabela _t na końcu zawiera zaliczone kroki.
-- ============================================================================

create temp table _t(step text) on commit drop;
do $$
declare
  v_super uuid; v_admin uuid; v_user uuid;
  v_result text;
  v_role text;
  v_is_admin boolean;
  v_count integer;
begin
  select id into v_super from public.profiles where role = 'super_admin' order by created_at limit 1;
  if v_super is null then
    raise exception 'Potrzebny co najmniej 1 profil super_admin — uruchom migrację 0070 najpierw';
  end if;

  select id into v_admin from public.profiles where id <> v_super order by created_at limit 1;
  select id into v_user from public.profiles where id <> v_super and id <> v_admin order by created_at limit 1;
  if v_admin is null or v_user is null then
    raise exception 'Potrzebne min. 3 profile do testu (znaleziono za mało)';
  end if;

  -- reset stanu testowego, na wypadek ponownego uruchomienia
  update public.profiles set role = 'user', is_admin = false where id in (v_admin, v_user);
  delete from public.admin_audit_log where entity_id in (v_admin, v_user);

  -- 1) Zwykły user nie może nadać sobie roli
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  select public.admin_set_user_role(v_user, 'admin') into v_result;
  if v_result <> 'not_super_admin' then raise exception 'FAIL self-grant blocked, got %', v_result; end if;
  insert into _t values ('self-grant blocked OK');

  -- 2) Super admin nadaje ADMIN
  perform set_config('request.jwt.claims', json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
  select public.admin_set_user_role(v_admin, 'admin') into v_result;
  if v_result <> 'ok' then raise exception 'FAIL grant admin, got %', v_result; end if;
  select role, is_admin into v_role, v_is_admin from public.profiles where id = v_admin;
  if v_role <> 'admin' then raise exception 'FAIL role not persisted, got %', v_role; end if;
  if not v_is_admin then raise exception 'FAIL is_admin not synced on grant'; end if;
  insert into _t values ('grant admin + is_admin sync OK');

  -- 3) Log audytowy zapisany
  select count(*) into v_count from public.admin_audit_log
    where entity_id = v_admin and action = 'grant_admin' and actor_id = v_super;
  if v_count <> 1 then raise exception 'FAIL audit log missing for grant, count=%', v_count; end if;
  insert into _t values ('audit log grant OK');

  -- 4) admin_list_users pokazuje nowego admina pod filtrem 'admin'
  select count(*) into v_count from public.admin_list_users(null, 'admin', 100, 0) r where r.id = v_admin;
  if v_count <> 1 then raise exception 'FAIL admin_list_users did not return new admin'; end if;
  insert into _t values ('admin_list_users filter OK');

  -- 5) admin_list_audit_log pokazuje wpis
  select count(*) into v_count from public.admin_list_audit_log('user', 200) r
    where r.entity_id = v_admin and r.action = 'grant_admin';
  if v_count <> 1 then raise exception 'FAIL admin_list_audit_log missing entry'; end if;
  insert into _t values ('admin_list_audit_log OK');

  -- 6) Nowo mianowany ADMIN nie może nadawać ról (nie jest super adminem)
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select public.admin_set_user_role(v_user, 'admin') into v_result;
  if v_result <> 'not_super_admin' then raise exception 'FAIL admin cannot grant, got %', v_result; end if;
  insert into _t values ('admin cannot grant OK');

  -- 7) Nie można nadać roli super_admin przez RPC
  perform set_config('request.jwt.claims', json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
  select public.admin_set_user_role(v_user, 'super_admin') into v_result;
  if v_result <> 'invalid_role' then raise exception 'FAIL super_admin grant blocked, got %', v_result; end if;
  insert into _t values ('super_admin grant blocked OK');

  -- 8) Nie można dotknąć istniejącego super admina (chroni przed usunięciem ostatniego)
  select public.admin_set_user_role(v_super, 'user') into v_result;
  if v_result <> 'target_is_super_admin' then raise exception 'FAIL super_admin protected, got %', v_result; end if;
  insert into _t values ('super_admin protected OK');

  -- 9) Super admin odbiera ADMIN
  select public.admin_set_user_role(v_admin, 'user') into v_result;
  if v_result <> 'ok' then raise exception 'FAIL revoke admin, got %', v_result; end if;
  select role, is_admin into v_role, v_is_admin from public.profiles where id = v_admin;
  if v_role <> 'user' then raise exception 'FAIL role not reverted, got %', v_role; end if;
  if v_is_admin then raise exception 'FAIL is_admin not reverted on revoke'; end if;
  insert into _t values ('revoke admin + is_admin sync OK');

  raise notice 'Wszystkie testy ról administracyjnych zaliczone: %', (select string_agg(step, ', ') from _t);
end;
$$;

select * from _t;
