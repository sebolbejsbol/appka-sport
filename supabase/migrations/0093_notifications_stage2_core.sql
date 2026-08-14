-- ETAP 2 (część 1): powiadomienia o zmianie/odwołaniu eventu, reakcjach na
-- wiadomości, dodatkowe okna przypomnień (24h/1h obok istniejących 20/5 min),
-- oraz migracja na wielourządzeniowe tokeny push (public.push_tokens) z
-- podmianą send_expo_push na wysyłkę do WSZYSTKICH aktywnych urządzeń usera.
-- Decyzje potwierdzone przez użytkownika 2026-08-14: dodać okna 24h/1h OBOK
-- istniejących (nie zastępować), zmigrować na wiele urządzeń teraz.

-- ---------------------------------------------------------------------
-- 1) Wielourządzeniowe tokeny push
-- ---------------------------------------------------------------------

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique,
  platform text not null default 'unknown' check (platform in ('ios', 'android', 'web', 'unknown')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_tokens_user_id_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

drop policy if exists "push_tokens_select_own" on public.push_tokens;
create policy "push_tokens_select_own" on public.push_tokens
  for select using (auth.uid() = user_id);

-- Backfill z istniejącej pojedynczej kolumny (profiles.expo_push_token
-- zostaje jako legacy fallback, nie jest usuwana).
insert into public.push_tokens (user_id, token, platform)
select id, expo_push_token, 'unknown'
from public.profiles
where expo_push_token is not null and trim(expo_push_token) <> ''
on conflict (token) do nothing;

create or replace function public.save_push_token(p_token text, p_platform text default 'unknown')
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if p_token is null or trim(p_token) = '' then
    -- pusty token = "wyloguj to urządzenie" (parytet ze starym
    -- save_expo_push_token(null) wywoływanym z clearPushTokenOnServer()).
    delete from public.push_tokens where user_id = auth.uid();
    update public.profiles set expo_push_token = null where id = auth.uid();
    return;
  end if;

  insert into public.push_tokens (user_id, token, platform, updated_at)
  values (auth.uid(), trim(p_token), coalesce(nullif(trim(p_platform), ''), 'unknown'), now())
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        updated_at = now();

  -- legacy kolumna trzymana w sync dla bezpieczeństwa (stary klient / rollback)
  update public.profiles set expo_push_token = trim(p_token) where id = auth.uid();
end;
$$;

-- Stary RPC zostaje jako cienki wrapper — istniejący klient dalej działa
-- bez wymuszonej natychmiastowej aktualizacji.
create or replace function public.save_expo_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.save_push_token(p_token, 'unknown');
end;
$$;

create or replace function public.remove_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  delete from public.push_tokens where token = p_token and user_id = auth.uid();
end;
$$;

-- Higiena martwych tokenów: usuwa urządzenia nieodświeżane od 90 dni.
-- Aktywne urządzenie odświeża swój token przy każdym starcie apki
-- (patrz use-push-notifications.ts), więc odinstalowana/martwa apka
-- naturalnie wypada z tabeli zamiast zalegać tam w nieskończoność.
create or replace function public.prune_stale_push_tokens()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_count integer;
begin
  delete from public.push_tokens where updated_at < now() - interval '90 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- notify_user: wysyła do WSZYSTKICH tokenów usera zamiast jednej kolumny;
-- fallback na starą kolumnę profiles.expo_push_token gdy user nie ma
-- jeszcze żadnego wiersza w push_tokens (np. tuż po tej migracji, przed
-- pierwszym uruchomieniem zaktualizowanego klienta).
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
set search_path to 'public'
as $$
declare
  r record;
  v_sent boolean := false;
begin
  if p_user_id is null then
    return;
  end if;

  insert into public.notifications (user_id, type, title, body, data)
  values (p_user_id, p_type, p_title, p_body, coalesce(p_data, '{}'::jsonb));

  for r in select token from public.push_tokens where user_id = p_user_id loop
    perform public.send_expo_push(r.token, p_title, p_body, p_data);
    v_sent := true;
  end loop;

  if not v_sent then
    perform public.send_expo_push(
      (select expo_push_token from public.profiles where id = p_user_id),
      p_title, p_body, p_data
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 2) Powiadomienie o zmianie / odwołaniu eventu
-- ---------------------------------------------------------------------

create or replace function public.notify_event_changed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
  v_reason text;
  v_title text;
begin
  if NEW.status = 'cancelled' and OLD.status is distinct from 'cancelled' then
    v_reason := 'cancelled';
  elsif NEW.starts_at is distinct from OLD.starts_at
     or NEW.lat is distinct from OLD.lat
     or NEW.lng is distinct from OLD.lng
     or coalesce(NEW.location_name, '') is distinct from coalesce(OLD.location_name, '') then
    v_reason := 'updated';
  else
    return NEW;
  end if;

  v_title := coalesce(nullif(trim(NEW.title), ''), 'Event');

  for r in
    select ep.user_id
    from public.event_participants ep
    where ep.event_id = NEW.id and ep.user_id <> NEW.creator_id
  loop
    if v_reason = 'cancelled' then
      perform public.notify_user(
        r.user_id, 'event_cancelled', 'Event odwołany',
        v_title || ' został odwołany przez organizatora.',
        jsonb_build_object('eventId', NEW.id, 'event_id', NEW.id, 'type', 'event_cancelled')
      );
    else
      perform public.notify_user(
        r.user_id, 'event_updated', 'Zmiana w evencie',
        v_title || ' — organizator zmienił termin lub miejsce.',
        jsonb_build_object('eventId', NEW.id, 'event_id', NEW.id, 'type', 'event_updated')
      );
    end if;
  end loop;

  return NEW;
end;
$$;

drop trigger if exists trg_notify_event_changes on public.events;
create trigger trg_notify_event_changes
  after update on public.events
  for each row execute function public.notify_event_changed();

-- Twarde usunięcie eventu (deleteEvent() w kliencie) nie przechodzi przez
-- UPDATE, więc potrzebuje osobnego triggera. BEFORE DELETE (nie AFTER) —
-- żeby wiersze event_participants na pewno jeszcze istniały w momencie
-- odczytu, zanim zadziała ON DELETE CASCADE.
create or replace function public.notify_event_deleted()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
  v_title text;
begin
  v_title := coalesce(nullif(trim(OLD.title), ''), 'Event');

  for r in
    select ep.user_id
    from public.event_participants ep
    where ep.event_id = OLD.id and ep.user_id <> OLD.creator_id
  loop
    perform public.notify_user(
      r.user_id, 'event_cancelled', 'Event odwołany',
      v_title || ' został odwołany przez organizatora.',
      jsonb_build_object('eventId', OLD.id, 'event_id', OLD.id, 'type', 'event_cancelled')
    );
  end loop;

  return OLD;
end;
$$;

drop trigger if exists trg_notify_event_deleted on public.events;
create trigger trg_notify_event_deleted
  before delete on public.events
  for each row execute function public.notify_event_deleted();

-- ---------------------------------------------------------------------
-- 3) Powiadomienie o reakcji na wiadomość
-- ---------------------------------------------------------------------

create or replace function public.toggle_reaction(p_message_id uuid, p_emoji text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_emoji text := nullif(btrim(p_emoji), '');
  v_conv uuid;
  v_author uuid;
  v_exists boolean;
  v_nick text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_emoji is null or char_length(v_emoji) > 16 then raise exception 'invalid_emoji'; end if;
  select conversation_id, sender_id into v_conv, v_author from public.messages where id = p_message_id and deleted_at is null;
  if v_conv is null then raise exception 'not_found'; end if;
  if not exists (select 1 from public.conversation_members cm where cm.conversation_id = v_conv and cm.user_id = v_uid) then raise exception 'not_member'; end if;
  select exists (select 1 from public.message_reactions where message_id = p_message_id and user_id = v_uid and emoji = v_emoji) into v_exists;
  if v_exists then
    delete from public.message_reactions where message_id = p_message_id and user_id = v_uid and emoji = v_emoji;
    return false;
  else
    insert into public.message_reactions (message_id, user_id, emoji) values (p_message_id, v_uid, v_emoji) on conflict do nothing;

    if v_author is not null and v_author <> v_uid then
      select nick into v_nick from public.profiles where id = v_uid;
      perform public.notify_user(
        v_author, 'message_reaction', 'Nowa reakcja',
        coalesce(v_nick, 'Ktoś') || ' zareagował(a) ' || v_emoji || ' na Twoją wiadomość.',
        jsonb_build_object('conversationId', v_conv, 'conversation_id', v_conv, 'messageId', p_message_id, 'type', 'message_reaction')
      );
    end if;

    return true;
  end if;
end;$function$;

-- ---------------------------------------------------------------------
-- 4) Dodatkowe okna przypomnień: 24h i 1h przed startem, OBOK istniejących
--    20min (checkin_open) / 5min (event_start) — te nie są ruszane.
-- ---------------------------------------------------------------------

alter table public.push_notification_log drop constraint if exists push_notification_log_kind_check;
alter table public.push_notification_log add constraint push_notification_log_kind_check
  check (kind = any (array['checkin_open', 'event_start', 'reminder_24h', 'reminder_1h']));

create or replace function public.process_event_push_reminders()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sent integer := 0;
  r record;
begin
  for r in
    select e.id as event_id, ep.user_id, e.title
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
      r.user_id, 'checkin_open', 'Meldowanie otwarte',
      coalesce(nullif(trim(r.title), ''), 'Twój event') || ' — możesz się zameldować na boisku.',
      jsonb_build_object('eventId', r.event_id, 'event_id', r.event_id, 'type', 'checkin_open')
    );
    insert into public.push_notification_log (event_id, user_id, kind) values (r.event_id, r.user_id, 'checkin_open') on conflict do nothing;
    v_sent := v_sent + 1;
  end loop;

  for r in
    select e.id as event_id, ep.user_id, e.title
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
      r.user_id, 'event_start', 'Event za chwilę',
      coalesce(nullif(trim(r.title), ''), 'Twój event') || ' startuje za kilka minut.',
      jsonb_build_object('eventId', r.event_id, 'event_id', r.event_id, 'type', 'event_start')
    );
    insert into public.push_notification_log (event_id, user_id, kind) values (r.event_id, r.user_id, 'event_start') on conflict do nothing;
    v_sent := v_sent + 1;
  end loop;

  for r in
    select e.id as event_id, ep.user_id, e.title
    from public.events e
    inner join public.event_participants ep on ep.event_id = e.id
    where e.status = 'planned'
      and e.starts_at between now() + interval '23 hours 55 minutes' and now() + interval '24 hours 5 minutes'
      and not exists (
        select 1 from public.push_notification_log l
        where l.event_id = e.id and l.user_id = ep.user_id and l.kind = 'reminder_24h'
      )
  loop
    perform public.notify_user(
      r.user_id, 'reminder_24h', 'Jutro grasz',
      coalesce(nullif(trim(r.title), ''), 'Twój event') || ' odbędzie się jutro o tej porze.',
      jsonb_build_object('eventId', r.event_id, 'event_id', r.event_id, 'type', 'reminder_24h')
    );
    insert into public.push_notification_log (event_id, user_id, kind) values (r.event_id, r.user_id, 'reminder_24h') on conflict do nothing;
    v_sent := v_sent + 1;
  end loop;

  for r in
    select e.id as event_id, ep.user_id, e.title
    from public.events e
    inner join public.event_participants ep on ep.event_id = e.id
    where e.status = 'planned'
      and e.starts_at between now() + interval '55 minutes' and now() + interval '65 minutes'
      and not exists (
        select 1 from public.push_notification_log l
        where l.event_id = e.id and l.user_id = ep.user_id and l.kind = 'reminder_1h'
      )
  loop
    perform public.notify_user(
      r.user_id, 'reminder_1h', 'Za godzinę grasz',
      coalesce(nullif(trim(r.title), ''), 'Twój event') || ' zaczyna się za godzinę.',
      jsonb_build_object('eventId', r.event_id, 'event_id', r.event_id, 'type', 'reminder_1h')
    );
    insert into public.push_notification_log (event_id, user_id, kind) values (r.event_id, r.user_id, 'reminder_1h') on conflict do nothing;
    v_sent := v_sent + 1;
  end loop;

  return v_sent;
end;
$$;

grant execute on function public.save_push_token(text, text) to authenticated;
grant execute on function public.remove_push_token(text) to authenticated;

-- Cotygodniowe czyszczenie martwych tokenów (niedziela 4:00) — osobny,
-- rzadszy job od 5-minutowego przypominacza.
select cron.schedule(
  'prune-stale-push-tokens',
  '0 4 * * 0',
  $$select public.prune_stale_push_tokens();$$
) where not exists (select 1 from cron.job where jobname = 'prune-stale-push-tokens');
