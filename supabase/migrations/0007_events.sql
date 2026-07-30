-- Migracja 0007: mecze (events) na boiskach + uczestnicy
-- Uruchom w Supabase: Dashboard → SQL Editor → New query → wklej całość → Run.
-- Idempotentne (bezpieczne do ponownego uruchomienia).
--
-- Architektura (PLAN.md → mechanika meczów):
--  - event = zaplanowany mecz na konkretnym boisku (field), o danej godzinie,
--  - organizator (creator) jest automatycznie pierwszym uczestnikiem,
--  - inni gracze dołączają / wypisują się (event_participants),
--  - widoczność: zalogowani widzą wszystkie zaplanowane mecze (społeczność lokalna).

-- 1) Tabela meczów
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references public.fields (id) on delete cascade,
  creator_id uuid not null references auth.users (id) on delete cascade,
  title text,
  sport text not null default 'basketball',
  starts_at timestamptz not null,
  duration_min integer not null default 90 check (duration_min between 15 and 600),
  max_players integer check (max_players is null or max_players between 2 and 100),
  notes text,
  status text not null default 'planned' check (status in ('planned', 'cancelled', 'finished')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.events is 'Zaplanowane mecze na boiskach. Organizator + uczestnicy (event_participants).';

create index if not exists events_field_idx on public.events (field_id);
create index if not exists events_starts_at_idx on public.events (starts_at);

-- 2) Tabela uczestników (kto dołączył do meczu)
create table if not exists public.event_participants (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

comment on table public.event_participants is 'Uczestnicy meczów (relacja wiele-do-wielu event ↔ użytkownik).';

create index if not exists event_participants_user_idx on public.event_participants (user_id);

-- 3) Row Level Security
alter table public.events enable row level security;
alter table public.event_participants enable row level security;

-- Zalogowani widzą wszystkie mecze.
drop policy if exists "Events viewable by authenticated users" on public.events;
create policy "Events viewable by authenticated users"
  on public.events for select
  to authenticated
  using (true);

-- Tworzyć mecz może każdy zalogowany, ale tylko jako jego organizator.
drop policy if exists "Users can create their own events" on public.events;
create policy "Users can create their own events"
  on public.events for insert
  to authenticated
  with check (auth.uid() = creator_id);

-- Edytować / odwołać mecz może tylko organizator.
drop policy if exists "Creators can update their events" on public.events;
create policy "Creators can update their events"
  on public.events for update
  to authenticated
  using (auth.uid() = creator_id)
  with check (auth.uid() = creator_id);

drop policy if exists "Creators can delete their events" on public.events;
create policy "Creators can delete their events"
  on public.events for delete
  to authenticated
  using (auth.uid() = creator_id);

-- Uczestników widzą wszyscy zalogowani.
drop policy if exists "Participants viewable by authenticated users" on public.event_participants;
create policy "Participants viewable by authenticated users"
  on public.event_participants for select
  to authenticated
  using (true);

-- Dołączyć można tylko siebie.
drop policy if exists "Users can join events themselves" on public.event_participants;
create policy "Users can join events themselves"
  on public.event_participants for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Wypisać można tylko siebie.
drop policy if exists "Users can leave events themselves" on public.event_participants;
create policy "Users can leave events themselves"
  on public.event_participants for delete
  to authenticated
  using (auth.uid() = user_id);

-- 4) updated_at na events (reużywamy funkcji z migracji 0001)
drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- 5) Organizator automatycznie dołącza do swojego meczu jako uczestnik
create or replace function public.handle_new_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.event_participants (event_id, user_id)
  values (new.id, new.creator_id)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_event_created on public.events;
create trigger on_event_created
  after insert on public.events
  for each row execute function public.handle_new_event();

-- 6) RPC: nadchodzące mecze dla danego boiska (z liczbą graczy i flagą „czy dołączyłem")
create or replace function public.events_for_field(p_field_id uuid)
returns table (
  id uuid,
  title text,
  starts_at timestamptz,
  duration_min integer,
  max_players integer,
  notes text,
  status text,
  creator_id uuid,
  creator_nick text,
  participant_count bigint,
  is_joined boolean
)
language sql
stable
as $$
  select
    e.id,
    e.title,
    e.starts_at,
    e.duration_min,
    e.max_players,
    e.notes,
    e.status,
    e.creator_id,
    cp.nick as creator_nick,
    (select count(*) from public.event_participants ep where ep.event_id = e.id) as participant_count,
    exists(
      select 1 from public.event_participants ep2
      where ep2.event_id = e.id and ep2.user_id = auth.uid()
    ) as is_joined
  from public.events e
  left join public.profiles cp on cp.id = e.creator_id
  where e.field_id = p_field_id
    and e.status = 'planned'
    and e.starts_at > now() - interval '3 hours'
  order by e.starts_at asc;
$$;

grant execute on function public.events_for_field(uuid) to authenticated;

-- 7) RPC: dołącz do meczu z kontrolą limitu graczy (atomowo)
create or replace function public.join_event(p_event_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max integer;
  v_count integer;
  v_status text;
begin
  if auth.uid() is null then
    return 'not_authenticated';
  end if;

  select max_players, status into v_max, v_status
  from public.events
  where id = p_event_id
  for update;

  if not found then
    return 'not_found';
  end if;
  if v_status <> 'planned' then
    return 'closed';
  end if;

  if exists (
    select 1 from public.event_participants
    where event_id = p_event_id and user_id = auth.uid()
  ) then
    return 'already_joined';
  end if;

  if v_max is not null then
    select count(*) into v_count
    from public.event_participants
    where event_id = p_event_id;
    if v_count >= v_max then
      return 'full';
    end if;
  end if;

  insert into public.event_participants (event_id, user_id)
  values (p_event_id, auth.uid());

  return 'joined';
end;
$$;

grant execute on function public.join_event(uuid) to authenticated;

-- 8) Odśwież cache API
notify pgrst, 'reload schema';
