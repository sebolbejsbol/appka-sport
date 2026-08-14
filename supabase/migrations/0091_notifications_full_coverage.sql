-- Migracja 0091: pełne pokrycie powiadomieniami (w apce + push) wszystkich
-- logicznych akcji w aplikacji. Do tej pory jedynym typem, który trafiał do
-- tabeli `notifications` (dzwonek w apce), był 'favorite_court_event' — reszta
-- (dołączenie do eventu, zaproszenie do drużyny, wiadomości, polubienia/
-- komentarze postów, itd.) wysyłała TYLKO push, bez śladu w dzwonku, a kilka
-- akcji (zaproszenia do znajomych, prośby o dołączenie do drużyny, usunięcie
-- z drużyny/eventu) nie generowało żadnego powiadomienia w ogóle.
--
-- Wzorzec: jeden helper `notify_user()` (insert do notifications + push),
-- wołany zamiast rozrzuconych po funkcjach "select token; perform
-- send_expo_push(...)". Cała pozostała logika każdej funkcji zostaje
-- identyczna — patrz definicje z produkcyjnej bazy (pg_get_functiondef)
-- pobrane przed napisaniem tej migracji.
--
-- Świadomie POMINIĘTE w tym przejściu: turnieje (rejestracje/mecze/wyniki —
-- osobny, duży system, wymaga własnego audytu triggerów) oraz `send_message`
-- (v1, zastąpiony przez send_message_v2 — insert do `messages` i tak leci
-- przez ten sam trigger notify_on_new_message, więc pokrycie jest identyczne).
--
-- Uruchom w Supabase: Dashboard -> SQL Editor -> New query -> wklej całość -> Run.
-- Idempotentna (CREATE OR REPLACE / DROP TRIGGER IF EXISTS wszędzie).

-- 1) Wspólny helper: insert do notifications + push, jednym wywołaniem.
create or replace function public.notify_user(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if p_user_id is null then
    return;
  end if;

  insert into public.notifications (user_id, type, title, body, data)
  values (p_user_id, p_type, p_title, p_body, coalesce(p_data, '{}'::jsonb));

  select expo_push_token into v_token from public.profiles where id = p_user_id;
  perform public.send_expo_push(v_token, p_title, p_body, p_data);
end;
$$;

revoke all on function public.notify_user(uuid, text, text, text, jsonb) from public;
grant execute on function public.notify_user(uuid, text, text, text, jsonb) to authenticated;

-- 2) Dołączenie do eventu -> powiadomienie organizatora.
create or replace function public.notify_organizer_on_event_join()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator_id uuid;
  v_joiner_nick text;
  v_event_title text;
  v_body text;
begin
  select e.creator_id, e.title
  into v_creator_id, v_event_title
  from public.events e
  where e.id = NEW.event_id;

  if v_creator_id is null or NEW.user_id = v_creator_id then
    return NEW;
  end if;

  select p.nick into v_joiner_nick from public.profiles p where p.id = NEW.user_id;

  v_body := coalesce(nullif(trim(v_joiner_nick), ''), 'Ktoś') || ' dołączył do Twojego eventu';
  if v_event_title is not null and trim(v_event_title) <> '' then
    v_body := v_body || ' („' || trim(v_event_title) || '")';
  end if;

  perform public.notify_user(
    v_creator_id,
    'event_join',
    'Nowy gracz na evencie',
    v_body,
    jsonb_build_object('eventId', NEW.event_id, 'event_id', NEW.event_id, 'type', 'event_join')
  );

  return NEW;
end;
$$;

-- 3) Przypomnienia czasowe (meldowanie / start eventu) — cron.
create or replace function public.process_event_push_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sent integer := 0;
  r record;
begin
  for r in
    select
      e.id as event_id,
      ep.user_id,
      e.title
    from public.events e
    inner join public.event_participants ep on ep.event_id = e.id
    where e.status = 'planned'
      and e.starts_at between now() + interval '17 minutes' and now() + interval '23 minutes'
      and not exists (
        select 1 from public.push_notification_log l
        where l.event_id = e.id and l.user_id = ep.user_id and l.kind = 'checkin_open'
      )
  loop
    perform public.notify_user(
      r.user_id,
      'checkin_open',
      'Meldowanie otwarte',
      coalesce(nullif(trim(r.title), ''), 'Twój event') || ' — możesz się zameldować na boisku.',
      jsonb_build_object('eventId', r.event_id, 'event_id', r.event_id, 'type', 'checkin_open')
    );
    insert into public.push_notification_log (event_id, user_id, kind)
    values (r.event_id, r.user_id, 'checkin_open')
    on conflict do nothing;
    v_sent := v_sent + 1;
  end loop;

  for r in
    select
      e.id as event_id,
      ep.user_id,
      e.title
    from public.events e
    inner join public.event_participants ep on ep.event_id = e.id
    where e.status = 'planned'
      and e.starts_at between now() + interval '3 minutes' and now() + interval '7 minutes'
      and not exists (
        select 1 from public.push_notification_log l
        where l.event_id = e.id and l.user_id = ep.user_id and l.kind = 'event_start'
      )
  loop
    perform public.notify_user(
      r.user_id,
      'event_start',
      'Event za chwilę',
      coalesce(nullif(trim(r.title), ''), 'Twój event') || ' startuje za kilka minut.',
      jsonb_build_object('eventId', r.event_id, 'event_id', r.event_id, 'type', 'event_start')
    );
    insert into public.push_notification_log (event_id, user_id, kind)
    values (r.event_id, r.user_id, 'event_start')
    on conflict do nothing;
    v_sent := v_sent + 1;
  end loop;

  return v_sent;
end;
$$;

-- 4) Zaproszenie do drużyny.
create or replace function public.invite_to_team(p_team_id uuid, p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_team_name text;
begin
  if v_uid is null then return 'not_authenticated'; end if;
  if not public.is_team_manager(p_team_id, v_uid) then return 'forbidden'; end if;
  if p_user_id is null or p_user_id = v_uid then return 'invalid_user'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id) then return 'user_not_found'; end if;
  if public.is_team_member(p_team_id, p_user_id) then return 'already_member'; end if;
  insert into public.team_invitations (team_id, from_user_id, to_user_id, status)
  values (p_team_id, v_uid, p_user_id, 'pending')
  on conflict (team_id, to_user_id) do update set from_user_id = excluded.from_user_id, status = 'pending', created_at = now(), responded_at = null
  where public.team_invitations.status <> 'pending';
  if not found and exists (select 1 from public.team_invitations ti where ti.team_id = p_team_id and ti.to_user_id = p_user_id and ti.status = 'pending') then return 'request_pending'; end if;
  select t.name into v_team_name from public.teams t where t.id = p_team_id;
  perform public.notify_user(
    p_user_id,
    'team_invite',
    'Zaproszenie do drużyny',
    coalesce(v_team_name, 'Drużyna'),
    jsonb_build_object('type', 'team_invite', 'team_id', p_team_id::text)
  );
  return 'sent';
end;
$$;

-- 5) Zaproszenie drużyny na mecz (każdy członek drużyny).
create or replace function public.invite_team_to_event(p_event_id uuid, p_team_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid(); v_inv_id uuid; v_event_title text; v_team_name text; v_member record;
begin
  if v_uid is null then return 'not_authenticated'; end if;
  if not exists (select 1 from public.events e where e.id = p_event_id and e.creator_id = v_uid) then return 'forbidden'; end if;
  if not public.is_team_member(p_team_id, v_uid) then return 'not_team_member'; end if;
  insert into public.team_event_invitations (event_id, team_id, invited_by) values (p_event_id, p_team_id, v_uid)
  on conflict (event_id, team_id) do nothing returning id into v_inv_id;
  if v_inv_id is null then
    select tei.id into v_inv_id from public.team_event_invitations tei where tei.event_id = p_event_id and tei.team_id = p_team_id;
    return 'already_invited';
  end if;
  insert into public.team_event_invitation_responses (invitation_id, user_id, status)
  select v_inv_id, tm.user_id, 'pending' from public.team_members tm where tm.team_id = p_team_id on conflict do nothing;
  select e.title into v_event_title from public.events e where e.id = p_event_id;
  select t.name into v_team_name from public.teams t where t.id = p_team_id;
  for v_member in
    select tm.user_id from public.team_members tm where tm.team_id = p_team_id
  loop
    perform public.notify_user(
      v_member.user_id,
      'team_event_invite',
      'Zaproszenie drużyny na mecz',
      coalesce(v_team_name, 'Drużyna') || ' → ' || coalesce(nullif(trim(v_event_title), ''), 'Event'),
      jsonb_build_object('type', 'team_event_invite', 'event_id', p_event_id::text, 'team_id', p_team_id::text, 'invitation_id', v_inv_id::text)
    );
  end loop;
  return 'ok';
end;
$$;

-- 6) Nowa wiadomość (DM / grupa / czat drużyny).
create or replace function public.notify_on_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient record;
  v_sender_nick text;
  v_team_id uuid;
  v_kind text;
  v_title text;
  v_body text;
  v_group_title text;
begin
  if new.kind = 'system' then
    update public.conversations set updated_at = now() where id = new.conversation_id;
    return new;
  end if;

  select p.nick into v_sender_nick from public.profiles p where p.id = new.sender_id;

  v_body := case
    when new.body is not null and btrim(new.body) <> '' then left(new.body, 160)
    when new.kind = 'image' then '📷 Zdjęcie'
    when new.kind = 'video' then '🎥 Film'
    when new.kind = 'audio' then '🎤 Wiadomość głosowa'
    when new.kind = 'file' then '📎 Plik'
    else 'Nowa wiadomość'
  end;

  select tc.team_id into v_team_id from public.team_conversations tc where tc.conversation_id = new.conversation_id;
  select c.kind, c.title into v_kind, v_group_title from public.conversations c where c.id = new.conversation_id;

  if v_team_id is not null then
    v_title := coalesce(nullif(trim(v_sender_nick), ''), 'Czat drużyny');
    for v_recipient in
      select cm.user_id from public.conversation_members cm
      where cm.conversation_id = new.conversation_id and cm.user_id <> new.sender_id and cm.muted = false
    loop
      perform public.notify_user(
        v_recipient.user_id, 'team_message', v_title, v_body,
        jsonb_build_object('type','team_message','team_id', v_team_id::text,'conversation_id', new.conversation_id::text));
    end loop;
  elsif v_kind = 'group' then
    v_title := coalesce(nullif(trim(v_group_title), ''), 'Grupa');
    for v_recipient in
      select cm.user_id from public.conversation_members cm
      where cm.conversation_id = new.conversation_id and cm.user_id <> new.sender_id and cm.muted = false
    loop
      perform public.notify_user(
        v_recipient.user_id, 'group_message', v_title,
        coalesce(nullif(trim(v_sender_nick), ''), '') || ': ' || v_body,
        jsonb_build_object('type','group_message','conversation_id', new.conversation_id::text));
    end loop;
  else
    select cm.user_id, cm.muted into v_recipient
    from public.conversation_members cm
    where cm.conversation_id = new.conversation_id and cm.user_id <> new.sender_id limit 1;
    if v_recipient.user_id is not null and v_recipient.muted = false then
      perform public.notify_user(
        v_recipient.user_id, 'dm', coalesce(nullif(trim(v_sender_nick), ''), 'Nowa wiadomość'), v_body,
        jsonb_build_object('type','dm','conversation_id', new.conversation_id::text));
    end if;
  end if;

  update public.conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;

-- 7) Polubienie posta.
create or replace function public.toggle_post_like(p_post_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_author uuid; v_nick text;
begin
  if v_uid is null then return 'not_authenticated'; end if;
  if not public.can_view_post(p_post_id, v_uid) then return 'forbidden'; end if;
  select po.author_id into v_author from public.posts po where po.id = p_post_id;
  if not found then return 'not_found'; end if;
  if exists (select 1 from public.post_likes pl where pl.post_id = p_post_id and pl.user_id = v_uid) then
    delete from public.post_likes where post_id = p_post_id and user_id = v_uid;
    return 'unliked';
  end if;
  insert into public.post_likes (post_id, user_id) values (p_post_id, v_uid);
  if v_author <> v_uid then
    select nick into v_nick from public.profiles where id = v_uid;
    perform public.notify_user(
      v_author, 'post_like',
      coalesce(nullif(trim(v_nick), ''), 'Gracz') || ' polubił Twój post',
      'Zobacz w aktualnościach',
      jsonb_build_object('type', 'post_like', 'post_id', p_post_id::text));
  end if;
  return 'liked';
end;
$$;

-- 8) Komentarz / odpowiedź na komentarz.
create or replace function public.create_post_comment(p_post_id uuid, p_body text, p_parent_id uuid default null::uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_body text;
  v_id uuid;
  v_author uuid;
  v_parent_author uuid;
  v_parent_post uuid;
  v_parent_top uuid;
  v_effective_parent uuid;
  v_nick text;
  v_preview text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not public.can_view_post(p_post_id, v_uid) then
    raise exception 'forbidden';
  end if;

  v_body := trim(coalesce(p_body, ''));
  if char_length(v_body) < 1 or char_length(v_body) > 500 then
    raise exception 'invalid_body';
  end if;

  select po.author_id into v_author from public.posts po where po.id = p_post_id;
  if not found then
    raise exception 'not_found';
  end if;

  v_effective_parent := null;
  if p_parent_id is not null then
    select pc.post_id, pc.author_id, coalesce(pc.parent_id, pc.id)
      into v_parent_post, v_parent_author, v_parent_top
    from public.post_comments pc
    where pc.id = p_parent_id;

    if not found or v_parent_post <> p_post_id then
      raise exception 'invalid_parent';
    end if;

    v_effective_parent := v_parent_top;
  end if;

  insert into public.post_comments (post_id, author_id, body, parent_id)
  values (p_post_id, v_uid, v_body, v_effective_parent)
  returning id into v_id;

  v_preview := v_body;
  if char_length(v_preview) > 80 then
    v_preview := left(v_preview, 77) || '…';
  end if;

  select nick into v_nick from public.profiles where id = v_uid;

  if v_author <> v_uid then
    perform public.notify_user(
      v_author, 'post_comment',
      coalesce(nullif(trim(v_nick), ''), 'Gracz') || ' skomentował Twój post',
      v_preview,
      jsonb_build_object('type', 'post_comment', 'post_id', p_post_id::text));
  end if;

  if p_parent_id is not null
     and v_parent_author is not null
     and v_parent_author <> v_uid
     and v_parent_author <> v_author then
    perform public.notify_user(
      v_parent_author, 'post_comment',
      coalesce(nullif(trim(v_nick), ''), 'Gracz') || ' odpowiedział na Twój komentarz',
      v_preview,
      jsonb_build_object('type', 'post_comment', 'post_id', p_post_id::text));
  end if;

  return v_id;
end;
$$;

-- 9) Oznaczenie (@nick) w poście.
create or replace function public.sync_post_mentions(p_post_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_nick text; v_mentioned uuid; v_author_nick text;
begin
  delete from public.post_mentions where post_id = p_post_id;
  select nick into v_author_nick from public.profiles where id = v_uid;
  for v_nick in select distinct lower(m[1]) from regexp_matches(coalesce(p_body, ''), '@([A-Za-z0-9_]{2,24})', 'g') as m loop
    select p.id into v_mentioned from public.profiles p where lower(trim(p.nick)) = v_nick limit 1;
    if v_mentioned is not null then
      insert into public.post_mentions (post_id, user_id) values (p_post_id, v_mentioned) on conflict do nothing;
      if v_mentioned <> v_uid then
        perform public.notify_user(
          v_mentioned, 'post_mention',
          coalesce(nullif(trim(v_author_nick), ''), 'Gracz') || ' oznaczył Cię w poście',
          left(coalesce(p_body, ''), 80),
          jsonb_build_object('type', 'post_mention', 'post_id', p_post_id::text));
      end if;
    end if;
  end loop;
end;
$$;

-- 10) Zaproszenie 1:1 na event ("Szukaj teraz").
create or replace function public.invite_user_to_event(p_event_id uuid, p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_status text; v_starts timestamptz; v_creator uuid; v_title text;
begin
  if v_uid is null then return 'not_authenticated'; end if;
  if p_user_id is null or p_user_id = v_uid then return 'invalid_user'; end if;
  select status, starts_at, creator_id, title into v_status, v_starts, v_creator, v_title from public.events where id = p_event_id;
  if not found then return 'not_found'; end if;
  if v_status <> 'planned' or v_starts <= now() then return 'closed'; end if;
  if v_creator <> v_uid and not exists (select 1 from public.event_participants ep where ep.event_id = p_event_id and ep.user_id = v_uid) then return 'forbidden'; end if;
  if p_user_id = v_creator or exists (select 1 from public.event_participants ep where ep.event_id = p_event_id and ep.user_id = p_user_id) then return 'already_member'; end if;
  if exists (select 1 from public.event_user_invitations i where i.event_id = p_event_id and i.to_user_id = p_user_id and i.status = 'pending') then return 'already_invited'; end if;
  insert into public.event_user_invitations (event_id, from_user_id, to_user_id, status, created_at, responded_at)
  values (p_event_id, v_uid, p_user_id, 'pending', now(), null)
  on conflict (event_id, to_user_id) do update set from_user_id = excluded.from_user_id, status = 'pending', created_at = now(), responded_at = null;
  perform public.notify_user(
    p_user_id, 'event_invite',
    'Zaproszenie na event',
    coalesce((select nick from public.profiles where id = v_uid), 'Ktoś') || ' zaprasza Cię do gry!',
    jsonb_build_object('type','event_invite','eventId', p_event_id::text, 'event_id', p_event_id::text));
  return 'sent';
end;
$$;

-- 11) Zwolnione miejsce na evencie (awans z listy rezerwowej).
create or replace function public.promote_event_waitlist(p_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_next uuid; v_max integer; v_count integer; v_title text;
begin
  select max_players into v_max from public.events where id = p_event_id;
  if v_max is null then return null; end if;
  select count(*) into v_count from public.event_participants where event_id = p_event_id;
  if v_count >= v_max then return null; end if;
  select w.user_id into v_next from public.event_waitlist w where w.event_id = p_event_id order by w.joined_at asc limit 1 for update skip locked;
  if v_next is null then return null; end if;
  insert into public.event_participants (event_id, user_id) values (p_event_id, v_next) on conflict do nothing;
  delete from public.event_waitlist where event_id = p_event_id and user_id = v_next;
  select coalesce(nullif(trim(e.title), ''), 'Event') into v_title from public.events e where e.id = p_event_id;
  perform public.notify_user(
    v_next, 'event_spot', 'Wolne miejsce na evencie', coalesce(v_title, 'Event'),
    jsonb_build_object('type', 'event_spot', 'event_id', p_event_id::text));
  return v_next;
end;
$$;

-- 12) NOWE: zaproszenie do znajomych + akceptacja.
create or replace function public.send_friend_request(p_to_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_nick text;
begin
  if v_uid is null then return 'not_authenticated'; end if;
  if p_to_user_id is null or p_to_user_id = v_uid then return 'invalid_user'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_to_user_id) then return 'user_not_found'; end if;
  if public.users_are_blocked(v_uid, p_to_user_id) then return 'blocked'; end if;
  if public.are_friends(v_uid, p_to_user_id) then return 'already_friends'; end if;
  if exists (select 1 from public.friend_requests fr where fr.status = 'pending' and ((fr.from_user_id = v_uid and fr.to_user_id = p_to_user_id) or (fr.from_user_id = p_to_user_id and fr.to_user_id = v_uid))) then return 'request_pending'; end if;
  delete from public.friend_requests where status = 'rejected' and from_user_id = v_uid and to_user_id = p_to_user_id;
  insert into public.friend_requests (from_user_id, to_user_id, status) values (v_uid, p_to_user_id, 'pending');
  select nick into v_nick from public.profiles where id = v_uid;
  perform public.notify_user(
    p_to_user_id, 'friend_request',
    'Nowe zaproszenie do znajomych',
    coalesce(nullif(trim(v_nick), ''), 'Ktoś') || ' chce dodać Cię do znajomych',
    jsonb_build_object('type', 'friend_request', 'from_user_id', v_uid::text));
  return 'sent';
end;
$$;

create or replace function public.respond_friend_request(p_request_id uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_from uuid;
  v_to uuid;
  v_pair record;
  v_nick text;
begin
  if v_uid is null then
    return 'not_authenticated';
  end if;

  select fr.from_user_id, fr.to_user_id
  into v_from, v_to
  from public.friend_requests fr
  where fr.id = p_request_id and fr.status = 'pending';

  if v_from is null then
    return 'not_found';
  end if;
  if v_to <> v_uid then
    return 'not_recipient';
  end if;

  if p_accept then
    update public.friend_requests
    set status = 'accepted', responded_at = now()
    where id = p_request_id;

    select * into v_pair from public.ordered_user_pair(v_from, v_to);
    insert into public.friendships (user_a, user_b)
    values (v_pair.user_a, v_pair.user_b)
    on conflict do nothing;

    select nick into v_nick from public.profiles where id = v_uid;
    perform public.notify_user(
      v_from, 'friend_request_accepted',
      'Zaproszenie zaakceptowane',
      coalesce(nullif(trim(v_nick), ''), 'Ktoś') || ' zaakceptował(a) Twoje zaproszenie do znajomych',
      jsonb_build_object('type', 'friend_request_accepted', 'user_id', v_uid::text));

    return 'accepted';
  end if;

  update public.friend_requests
  set status = 'rejected', responded_at = now()
  where id = p_request_id;

  return 'rejected';
end;
$$;

-- 13) NOWE: prośba o dołączenie do drużyny + odpowiedź.
create or replace function public.request_join_team(p_team_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_nick text; v_team_name text; v_manager record;
begin
  if v_uid is null then return 'not_authenticated'; end if;
  if not exists (select 1 from public.teams t where t.id = p_team_id) then return 'not_found'; end if;
  if public.is_team_member(p_team_id, v_uid) then return 'already_member'; end if;
  if exists (select 1 from public.team_join_requests r where r.team_id = p_team_id and r.user_id = v_uid and r.status = 'pending') then return 'request_pending'; end if;
  insert into public.team_join_requests (team_id, user_id, status)
  values (p_team_id, v_uid, 'pending')
  on conflict (team_id, user_id) do update set status = 'pending', created_at = now(), responded_at = null;

  select nick into v_nick from public.profiles where id = v_uid;
  select name into v_team_name from public.teams where id = p_team_id;
  for v_manager in
    select tm.user_id from public.team_members tm
    where tm.team_id = p_team_id and tm.role in ('owner', 'admin')
  loop
    perform public.notify_user(
      v_manager.user_id, 'team_join_request',
      'Prośba o dołączenie do drużyny',
      coalesce(nullif(trim(v_nick), ''), 'Ktoś') || ' chce dołączyć do ' || coalesce(v_team_name, 'drużyny'),
      jsonb_build_object('type', 'team_join_request', 'team_id', p_team_id::text, 'user_id', v_uid::text));
  end loop;

  return 'sent';
end;
$$;

create or replace function public.respond_team_join_request(p_request_id uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_team uuid; v_user uuid; v_team_name text;
begin
  if v_uid is null then return 'not_authenticated'; end if;
  select team_id, user_id into v_team, v_user from public.team_join_requests where id = p_request_id and status = 'pending';
  if v_team is null then return 'not_found'; end if;
  if not public.is_team_manager(v_team, v_uid) then return 'forbidden'; end if;
  select name into v_team_name from public.teams where id = v_team;
  if p_accept then
    insert into public.team_members (team_id, user_id, role) values (v_team, v_user, 'member') on conflict do nothing;
    update public.team_join_requests set status = 'accepted', responded_at = now() where id = p_request_id;
    perform public.notify_user(
      v_user, 'team_join_response',
      'Dołączyłeś do drużyny',
      coalesce(v_team_name, 'Drużyna'),
      jsonb_build_object('type', 'team_join_response', 'team_id', v_team::text, 'accepted', true));
    return 'accepted';
  end if;
  update public.team_join_requests set status = 'rejected', responded_at = now() where id = p_request_id;
  perform public.notify_user(
    v_user, 'team_join_response',
    'Prośba odrzucona',
    coalesce(v_team_name, 'Drużyna') || ' odrzuciła Twoją prośbę o dołączenie',
    jsonb_build_object('type', 'team_join_response', 'team_id', v_team::text, 'accepted', false));
  return 'rejected';
end;
$$;

-- 14) NOWE: usunięcie z drużyny / eventu (nie dotyczy samodzielnego wyjścia —
--     to osobne RPC leave_event/leave "opuść drużynę" z innej ścieżki UI).
create or replace function public.remove_team_member(p_team_id uuid, p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_target_role text; v_conv uuid; v_team_name text;
begin
  if v_uid is null then return 'not_authenticated'; end if;
  v_target_role := public.team_member_role(p_team_id, p_user_id);
  if v_target_role is null then return 'not_member'; end if;
  if p_user_id = v_uid then if v_target_role = 'owner' then return 'owner_cannot_leave'; end if;
  elsif not public.is_team_manager(p_team_id, v_uid) then return 'forbidden';
  elsif v_target_role = 'owner' then return 'cannot_remove_owner';
  elsif v_target_role = 'admin' and public.team_member_role(p_team_id, v_uid) <> 'owner' then return 'forbidden'; end if;
  delete from public.team_members where team_id = p_team_id and user_id = p_user_id;
  select tc.conversation_id into v_conv from public.team_conversations tc where tc.team_id = p_team_id;
  if v_conv is not null then delete from public.conversation_members where conversation_id = v_conv and user_id = p_user_id; end if;
  if p_user_id <> v_uid then
    select name into v_team_name from public.teams where id = p_team_id;
    perform public.notify_user(
      p_user_id, 'removed_from_team',
      'Usunięto Cię z drużyny',
      coalesce(v_team_name, 'Drużyna'),
      jsonb_build_object('type', 'removed_from_team', 'team_id', p_team_id::text));
  end if;
  return 'removed';
end;
$$;

create or replace function public.remove_event_participant(p_event_id uuid, p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_creator uuid; v_title text;
begin
  if v_uid is null then return 'not_authenticated'; end if;
  select creator_id into v_creator from public.events where id = p_event_id;
  if not found then return 'not_found'; end if;
  if v_uid <> v_creator and not public.is_app_admin() then return 'forbidden'; end if;
  if p_user_id = v_creator then return 'cannot_remove_organizer'; end if;
  delete from public.event_check_ins where event_id = p_event_id and user_id = p_user_id;
  delete from public.event_participants where event_id = p_event_id and user_id = p_user_id;
  if not found then return 'not_participant'; end if;
  select coalesce(nullif(trim(title), ''), 'Event') into v_title from public.events where id = p_event_id;
  perform public.notify_user(
    p_user_id, 'removed_from_event',
    'Usunięto Cię z eventu',
    coalesce(v_title, 'Event'),
    jsonb_build_object('type', 'removed_from_event', 'event_id', p_event_id::text));
  perform public.promote_event_waitlist(p_event_id);
  return 'removed';
end;
$$;

notify pgrst, 'reload schema';
