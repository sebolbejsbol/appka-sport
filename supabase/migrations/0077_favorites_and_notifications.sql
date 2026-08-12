-- Migracja 0077: ulubione boiska (favorite_fields) + powiadomienia w apce
-- (notifications). Gdy ktoś utworzy event na ulubionym boisku, każdy kto
-- je polubił (poza twórcą) dostaje wpis w notifications (trigger na
-- insert do events).
-- Uruchom w Supabase: Dashboard -> SQL Editor -> New query -> wklej całość -> Run.
-- Idempotentna (bezpieczna do ponownego uruchomienia).

-- 1) Ulubione boiska
create table if not exists public.favorite_fields (
  user_id uuid not null references auth.users (id) on delete cascade,
  field_id uuid not null references public.fields (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, field_id)
);

create index if not exists favorite_fields_field_idx on public.favorite_fields (field_id);

alter table public.favorite_fields enable row level security;

drop policy if exists "Users manage their own favorites" on public.favorite_fields;
create policy "Users manage their own favorites"
  on public.favorite_fields for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 2) Powiadomienia w apce
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists "Users read their own notifications" on public.notifications;
create policy "Users read their own notifications"
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users mark their own notifications read" on public.notifications;
create policy "Users mark their own notifications read"
  on public.notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
-- Celowo brak insert policy dla użytkowników: wpisy tworzą tylko triggery/RPC (security definer).

-- 3) toggle_field_favorite: dodaje/usuwa ulubione, zwraca nowy stan.
create or replace function public.toggle_field_favorite(p_field_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'not_authenticated';
  end if;

  if exists (
    select 1 from public.favorite_fields
    where user_id = v_actor and field_id = p_field_id
  ) then
    delete from public.favorite_fields where user_id = v_actor and field_id = p_field_id;
    return false;
  end if;

  insert into public.favorite_fields (user_id, field_id) values (v_actor, p_field_id)
  on conflict (user_id, field_id) do nothing;
  return true;
end;
$$;

revoke all on function public.toggle_field_favorite(uuid) from public;
grant execute on function public.toggle_field_favorite(uuid) to authenticated;

-- 4) list_my_favorite_field_ids: lekki odczyt dla mapy (zawsze pokaż ulubione,
--    niezależnie od aktywnych filtrów).
create or replace function public.list_my_favorite_field_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select field_id from public.favorite_fields where user_id = auth.uid();
$$;

revoke all on function public.list_my_favorite_field_ids() from public;
grant execute on function public.list_my_favorite_field_ids() to authenticated;

-- 5) Powiadomienia: odczyt, oznaczanie przeczytanych, licznik nieprzeczytanych.
create or replace function public.list_my_notifications(p_limit integer default 50)
returns table (
  id uuid, type text, title text, body text, data jsonb,
  read_at timestamptz, created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select n.id, n.type, n.title, n.body, n.data, n.read_at, n.created_at
  from public.notifications n
  where n.user_id = auth.uid()
  order by n.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

revoke all on function public.list_my_notifications(integer) from public;
grant execute on function public.list_my_notifications(integer) to authenticated;

create or replace function public.get_unread_notification_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from public.notifications
  where user_id = auth.uid() and read_at is null;
$$;

revoke all on function public.get_unread_notification_count() from public;
grant execute on function public.get_unread_notification_count() to authenticated;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return 'not_authenticated'; end if;
  update public.notifications
    set read_at = now()
    where id = p_notification_id and user_id = auth.uid() and read_at is null;
  return 'ok';
end;
$$;

revoke all on function public.mark_notification_read(uuid) from public;
grant execute on function public.mark_notification_read(uuid) to authenticated;

create or replace function public.mark_all_notifications_read()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return 'not_authenticated'; end if;
  update public.notifications
    set read_at = now()
    where user_id = auth.uid() and read_at is null;
  return 'ok';
end;
$$;

revoke all on function public.mark_all_notifications_read() from public;
grant execute on function public.mark_all_notifications_read() to authenticated;

-- 6) Trigger: nowy event na ulubionym boisku -> powiadomienie dla każdego,
--    kto je polubił (poza twórcą eventu). Odpalane niezależnie od tego, czy
--    insert do events przyszedł przez RPC czy bezpośredni insert klienta.
-- Uwaga: title/body trzymamy jako neutralny (nietłumaczony) fallback —
-- właściwy, przetłumaczony tekst dla type='favorite_court_event' renderuje
-- klient na podstawie `data.field_name`/`data.event_title` przez t(),
-- tak samo jak reszta tekstów w apce (i18n po stronie klienta, nie w bazie).
create or replace function public.notify_favorite_field_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_field_name text;
begin
  if new.field_id is null then
    return new;
  end if;

  select nullif(trim(f.name), '') into v_field_name
    from public.fields f where f.id = new.field_id;

  insert into public.notifications (user_id, type, title, body, data)
  select
    ff.user_id,
    'favorite_court_event',
    coalesce(v_field_name, 'Favorite court'),
    nullif(trim(new.title), ''),
    jsonb_build_object(
      'event_id', new.id,
      'field_id', new.field_id,
      'field_name', v_field_name,
      'event_title', nullif(trim(new.title), '')
    )
  from public.favorite_fields ff
  where ff.field_id = new.field_id
    and ff.user_id <> new.creator_id;

  return new;
end;
$$;

drop trigger if exists events_notify_favorite_field on public.events;
create trigger events_notify_favorite_field
  after insert on public.events
  for each row execute function public.notify_favorite_field_event();

notify pgrst, 'reload schema';
