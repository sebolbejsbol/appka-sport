-- ============================================================================
-- Messenger v2 — funkcjonalne testy backendu (asercje w PL/pgSQL).
-- Uruchamiaj na środowisku testowym/stagingu. Pełne przejście = brak wyjątku,
-- a tabela _t zawiera listę zaliczonych kroków.
--
-- UWAGA: w jednej transakcji now() jest stałe, dlatego:
--  - znaczniki odczytu/dostarczenia odbiorcy cofamy w czasie,
--  - test limitu szybkości uruchamiamy w osobnej transakcji (drugi blok).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- BLOK 1: statusy, edycja, reply, reakcje, media, usuwanie, uprawnienia grup
-- ─────────────────────────────────────────────────────────────────────────
create temp table _t(step text) on commit drop;
do $$
declare
  v_a uuid; v_b uuid;
  v_dm uuid; v_grp uuid; v_m1 uuid; v_m2 uuid; v_r boolean; v_hit boolean;
begin
  select id into v_a from public.profiles order by created_at limit 1;
  select id into v_b from public.profiles where id <> v_a order by created_at limit 1;
  if v_a is null or v_b is null then raise exception 'Potrzebne min. 2 profile'; end if;

  -- DM tworzymy bezpośrednio (reguła znajomości nie jest przedmiotem testu)
  insert into public.conversations (kind) values ('dm') returning id into v_dm;
  insert into public.conversation_members (conversation_id, user_id) values (v_dm, v_a), (v_dm, v_b);
  insert into public.dm_conversations (user_a, user_b, conversation_id)
    values (least(v_a, v_b), greatest(v_a, v_b), v_dm);
  update public.conversation_members
    set last_read_at = now() - interval '1 hour', last_delivered_at = now() - interval '1 hour'
    where conversation_id = v_dm and user_id = v_b;

  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  v_m1 := (public.send_message_v2(v_dm, 'hej')->>'id')::uuid;
  if ((public.list_messages_v2(v_dm))->0->>'status') <> 'sent' then raise exception 'FAIL sent'; end if;
  insert into _t values ('status sent OK');

  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  perform public.mark_conversation_delivered(v_dm);
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  if ((public.list_messages_v2(v_dm))->0->>'status') <> 'delivered' then raise exception 'FAIL delivered'; end if;
  insert into _t values ('status delivered OK');

  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  perform public.mark_conversation_read(v_dm);
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  if ((public.list_messages_v2(v_dm))->0->>'status') <> 'read' then raise exception 'FAIL read'; end if;
  insert into _t values ('status read OK');

  perform public.edit_message(v_m1, 'hej (poprawione)');
  select bool_or((e->>'id') = v_m1::text and (e->>'body') = 'hej (poprawione)' and (e->>'edited_at') is not null)
    into v_hit from json_array_elements(public.list_messages_v2(v_dm)) e;
  if not v_hit then raise exception 'FAIL edit'; end if;
  insert into _t values ('edit OK');

  v_m2 := (public.send_message_v2(v_dm, 'odpowiedz', 'text', v_m1)->>'id')::uuid;
  select bool_or((e->>'id') = v_m2::text and (e->'reply_to'->>'id') = v_m1::text)
    into v_hit from json_array_elements(public.list_messages_v2(v_dm)) e;
  if not v_hit then raise exception 'FAIL reply'; end if;
  insert into _t values ('reply OK');

  if public.toggle_reaction(v_m1, e'\U0001F44D') <> true then raise exception 'FAIL react add'; end if;
  if public.toggle_reaction(v_m1, e'\U0001F44D') <> false then raise exception 'FAIL react remove'; end if;
  insert into _t values ('reaction toggle OK');

  perform public.send_message_v2(v_dm, null, 'image', null,
    '[{"media_type":"image","storage_path":"x/a.jpg","size_bytes":1000}]'::jsonb);
  insert into _t values ('media image OK');

  begin
    perform public.send_message_v2(v_dm, null, 'video', null,
      '[{"media_type":"video","storage_path":"x/b.mp4","size_bytes":999999999}]'::jsonb);
    raise exception 'FAIL too_large not raised';
  exception when others then
    if sqlerrm not like '%file_too_large%' then raise; end if;
    insert into _t values ('media too large rejected OK');
  end;

  perform public.delete_message(v_m1);
  select bool_or((e->>'id') = v_m1::text and (e->>'is_deleted')::boolean)
    into v_hit from json_array_elements(public.list_messages_v2(v_dm)) e;
  if not v_hit then raise exception 'FAIL delete'; end if;
  insert into _t values ('delete OK');

  -- GRUPA
  v_grp := public.create_group('SMOKE GRP', array[v_b]::uuid[]);
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  begin
    perform public.set_group_title(v_grp, 'x');
    raise exception 'FAIL member rename allowed';
  exception when others then
    if sqlerrm not like '%forbidden%' then raise; end if;
    insert into _t values ('member cannot rename OK');
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  perform public.set_group_title(v_grp, 'SMOKE GRP 2');
  perform public.set_group_member_role(v_grp, v_b, 'admin');
  if public.conversation_member_role(v_grp, v_b) <> 'admin' then raise exception 'FAIL role'; end if;
  insert into _t values ('owner rename+role OK');

  if (public.search_conversations('SMOKE'))->0->>'title' is null then raise exception 'FAIL search'; end if;
  insert into _t values ('search OK');

  perform public.set_conversation_pinned(v_grp, true);
  perform public.leave_group(v_grp);
  if public.conversation_member_role(v_grp, v_b) <> 'owner' then raise exception 'FAIL owner transfer'; end if;
  insert into _t values ('owner transfer on leave OK');

  -- sprzątanie
  delete from public.conversations where id = v_grp;
  delete from public.conversations where id = v_dm;
end $$;
select step from _t;

-- ─────────────────────────────────────────────────────────────────────────
-- BLOK 2: limit szybkości (rate limiting) — osobna transakcja
-- ─────────────────────────────────────────────────────────────────────────
create temp table _t2(step text) on commit drop;
do $$
declare v_a uuid; v_b uuid; v_dm uuid; v_ok int := 0; v_raised boolean := false; i int;
begin
  select id into v_a from public.profiles order by created_at limit 1;
  select id into v_b from public.profiles where id <> v_a order by created_at limit 1;
  insert into public.conversations (kind) values ('dm') returning id into v_dm;
  insert into public.conversation_members (conversation_id, user_id) values (v_dm, v_a), (v_dm, v_b);
  insert into public.dm_conversations (user_a, user_b, conversation_id)
    values (least(v_a, v_b), greatest(v_a, v_b), v_dm);
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  for i in 1..40 loop
    begin
      perform public.send_message_v2(v_dm, 'spam ' || i);
      v_ok := v_ok + 1;
    exception when others then
      if sqlerrm like '%rate%' or sqlerrm like '%too_many%' or sqlerrm like '%slow_down%'
        then v_raised := true; exit; else raise; end if;
    end;
  end loop;
  if not v_raised then raise exception 'FAIL rate limit never triggered (ok=%)', v_ok; end if;
  insert into _t2 values ('rate limit triggered after ' || v_ok || ' msgs OK');
  delete from public.conversations where id = v_dm;
end $$;
select step from _t2;
