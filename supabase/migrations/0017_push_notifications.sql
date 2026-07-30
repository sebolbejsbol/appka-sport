-- Migracja 0017: powiadomienia push (Expo Push)
-- Uruchom w Supabase: SQL Editor → Run.
--
-- Wymaga włączenia rozszerzenia pg_net (Dashboard → Database → Extensions → pg_net).
-- Opcjonalnie: pg_cron co 5 min → select public.process_event_push_reminders();

-- 1) Token Expo Push na profilu
alter table public.profiles
  add column if not exists expo_push_token text;

comment on column public.profiles.expo_push_token is 'Token Expo Push (urządzenie użytkownika).';

-- 2) Log wysłanych powiadomień (deduplikacja przypomnień czasowych)
create table if not exists public.push_notification_log (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('checkin_open', 'event_start')),
  sent_at timestamptz not null default now(),
  unique (event_id, user_id, kind)
);

alter table public.push_notification_log enable row level security;
-- Brak polityk = tylko service role / security definer.

-- 3) Zapis tokenu z aplikacji (tylko własny profil)
create or replace function public.save_expo_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  update public.profiles
  set expo_push_token = nullif(trim(p_token), '')
  where id = auth.uid();
end;
$$;

grant execute on function public.save_expo_push_token(text) to authenticated;

-- 4) Helper: wyślij push przez Expo Push API (pg_net)
create or replace function public.send_expo_push(
  p_token text,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_token is null or trim(p_token) = '' then
    return;
  end if;

  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Accept', 'application/json'
    ),
    body := jsonb_build_object(
      'to', p_token,
      'title', p_title,
      'body', p_body,
      'data', coalesce(p_data, '{}'::jsonb),
      'sound', 'default'
    )
  );
exception
  when undefined_function then
    -- pg_net niedostępne — pomiń cicho (push zadziała po włączeniu rozszerzenia)
    null;
end;
$$;

-- 5) Push do organizatora gdy ktoś dołącza do eventu
create or replace function public.notify_organizer_on_event_join()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator_id uuid;
  v_creator_token text;
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

  select p.expo_push_token
  into v_creator_token
  from public.profiles p
  where p.id = v_creator_id;

  select p.nick into v_joiner_nick from public.profiles p where p.id = NEW.user_id;

  v_body := coalesce(nullif(trim(v_joiner_nick), ''), 'Ktoś') || ' dołączył do Twojego eventu';
  if v_event_title is not null and trim(v_event_title) <> '' then
    v_body := v_body || ' („' || trim(v_event_title) || '")';
  end if;

  perform public.send_expo_push(
    v_creator_token,
    'Nowy gracz na evencie',
    v_body,
    jsonb_build_object('eventId', NEW.event_id, 'type', 'event_join')
  );

  return NEW;
end;
$$;

drop trigger if exists on_event_participant_joined_push on public.event_participants;
create trigger on_event_participant_joined_push
  after insert on public.event_participants
  for each row execute function public.notify_organizer_on_event_join();

-- 6) Przypomnienia czasowe (okno meldowania + start) — wołaj z pg_cron co 5 min
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
  -- Okno meldowania: 20 min przed startem (±3 min)
  for r in
    select
      e.id as event_id,
      ep.user_id,
      p.expo_push_token,
      e.title
    from public.events e
    inner join public.event_participants ep on ep.event_id = e.id
    inner join public.profiles p on p.id = ep.user_id
    where e.status = 'planned'
      and e.starts_at between now() + interval '17 minutes' and now() + interval '23 minutes'
      and p.expo_push_token is not null
      and trim(p.expo_push_token) <> ''
      and not exists (
        select 1 from public.push_notification_log l
        where l.event_id = e.id and l.user_id = ep.user_id and l.kind = 'checkin_open'
      )
  loop
    perform public.send_expo_push(
      r.expo_push_token,
      'Meldowanie otwarte',
      coalesce(nullif(trim(r.title), ''), 'Twój event') || ' — możesz się zameldować na boisku.',
      jsonb_build_object('eventId', r.event_id, 'type', 'checkin_open')
    );
    insert into public.push_notification_log (event_id, user_id, kind)
    values (r.event_id, r.user_id, 'checkin_open')
    on conflict do nothing;
    v_sent := v_sent + 1;
  end loop;

  -- Start eventu: 5 min przed (±2 min)
  for r in
    select
      e.id as event_id,
      ep.user_id,
      p.expo_push_token,
      e.title
    from public.events e
    inner join public.event_participants ep on ep.event_id = e.id
    inner join public.profiles p on p.id = ep.user_id
    where e.status = 'planned'
      and e.starts_at between now() + interval '3 minutes' and now() + interval '7 minutes'
      and p.expo_push_token is not null
      and trim(p.expo_push_token) <> ''
      and not exists (
        select 1 from public.push_notification_log l
        where l.event_id = e.id and l.user_id = ep.user_id and l.kind = 'event_start'
      )
  loop
    perform public.send_expo_push(
      r.expo_push_token,
      'Event za chwilę',
      coalesce(nullif(trim(r.title), ''), 'Twój event') || ' startuje za kilka minut.',
      jsonb_build_object('eventId', r.event_id, 'type', 'event_start')
    );
    insert into public.push_notification_log (event_id, user_id, kind)
    values (r.event_id, r.user_id, 'event_start')
    on conflict do nothing;
    v_sent := v_sent + 1;
  end loop;

  return v_sent;
end;
$$;

-- Przykład pg_cron (włącz pg_cron w Extensions, potem w SQL Editor):
-- select cron.schedule(
--   'event-push-reminders',
--   '*/5 * * * *',
--   $$select public.process_event_push_reminders();$$
-- );

notify pgrst, 'reload schema';
