-- ──────────────────────────────────────────────────────────────────────────
-- 0036 — Eventy: rozszerzony model wydarzeń + wspólny RPC discover_events
-- Cel: jeden model danych dla wydarzeń sportowych (na boisku) i rozszerzonych
--      (koncerty, warsztaty itd.). Lista "Eventy" i mapa eventów korzystają
--      z tych samych rekordów (RPC discover_events). Nie ruszamy działających
--      RPC sportowych (upcoming_events, event_detail, join_event, ...).
-- ──────────────────────────────────────────────────────────────────────────

begin;

-- ── Rozszerzenie tabeli events ─────────────────────────────────────────────
alter table public.events
  add column if not exists category text not null default 'sport',
  add column if not exists subcategory text,
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists location_name text,
  add column if not exists description_long text,
  add column if not exists image_url text,
  add column if not exists organizer_name text,
  add column if not exists organizer_contact text,
  add column if not exists organizer_url text,
  add column if not exists price_cents integer;

-- Eventy rozszerzone nie muszą mieć boiska ani sportu
alter table public.events alter column field_id drop not null;
alter table public.events alter column sport drop not null;

-- Kategoria z dozwolonej listy
alter table public.events drop constraint if exists events_category_check;
alter table public.events add constraint events_category_check
  check (category = any (array['sport','hobby','rekreacja','kultura','muzyka','edukacja','biznes','inne']));

-- Cena nieujemna
alter table public.events drop constraint if exists events_price_cents_check;
alter table public.events add constraint events_price_cents_check
  check (price_cents is null or price_cents >= 0);

-- Większy limit uczestników (duże wydarzenia)
alter table public.events drop constraint if exists events_max_players_check;
alter table public.events add constraint events_max_players_check
  check (max_players is null or (max_players >= 2 and max_players <= 1000000));

-- Indeksy pod filtrowanie
create index if not exists events_category_idx on public.events (category);
create index if not exists events_subcategory_idx on public.events (subcategory);
create index if not exists events_status_starts_idx on public.events (status, starts_at);

-- Backfill istniejących eventów sportowych z danych boiska
update public.events e
set
  category = 'sport',
  subcategory = coalesce(nullif(f.sport, 'multi'), 'basketball'),
  sport = coalesce(nullif(f.sport, 'multi'), e.sport, 'basketball'),
  lat = st_y(f.geom::geometry),
  lng = st_x(f.geom::geometry),
  location_name = f.name
from public.fields f
where e.field_id = f.id
  and e.subcategory is null;

commit;

-- ── Wspólny RPC dla listy + mapy eventów ────────────────────────────────────
create or replace function public.discover_events(p_max_rows integer default 500)
returns table (
  id uuid,
  title text,
  category text,
  subcategory text,
  sport text,
  starts_at timestamptz,
  duration_min integer,
  ends_at timestamptz,
  lat double precision,
  lng double precision,
  location_name text,
  notes text,
  description_long text,
  image_url text,
  organizer_name text,
  organizer_contact text,
  organizer_url text,
  payment_status text,
  price_cents integer,
  max_players integer,
  field_id uuid,
  creator_id uuid,
  creator_nick text,
  participant_count bigint,
  is_joined boolean,
  is_mine boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id,
    e.title,
    e.category,
    e.subcategory,
    e.sport,
    e.starts_at,
    e.duration_min,
    e.starts_at + make_interval(mins => e.duration_min) as ends_at,
    coalesce(e.lat, st_y(f.geom::geometry)) as lat,
    coalesce(e.lng, st_x(f.geom::geometry)) as lng,
    coalesce(e.location_name, f.name) as location_name,
    e.notes,
    e.description_long,
    e.image_url,
    e.organizer_name,
    e.organizer_contact,
    e.organizer_url,
    e.payment_status,
    e.price_cents,
    e.max_players,
    e.field_id,
    e.creator_id,
    p.nick as creator_nick,
    (select count(*) from public.event_participants ep where ep.event_id = e.id) as participant_count,
    exists (select 1 from public.event_participants ep where ep.event_id = e.id and ep.user_id = auth.uid()) as is_joined,
    (e.creator_id = auth.uid()) as is_mine
  from public.events e
  left join public.fields f on f.id = e.field_id
  left join public.profiles p on p.id = e.creator_id
  where e.status = 'planned'
    and e.starts_at > now() - interval '3 hours'
    and (e.field_id is null or f.status = 'approved')
  order by e.starts_at asc
  limit greatest(1, least(p_max_rows, 2000));
$$;

grant execute on function public.discover_events(integer) to anon, authenticated;

-- ── Storage: bucket na zdjęcia wydarzeń ─────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('event-images', 'event-images', true)
on conflict (id) do nothing;

drop policy if exists "event-images public read" on storage.objects;
create policy "event-images public read" on storage.objects
  for select using (bucket_id = 'event-images');

drop policy if exists "event-images owner insert" on storage.objects;
create policy "event-images owner insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'event-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "event-images owner update" on storage.objects;
create policy "event-images owner update" on storage.objects
  for update to authenticated
  using (bucket_id = 'event-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "event-images owner delete" on storage.objects;
create policy "event-images owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'event-images' and (storage.foldername(name))[1] = auth.uid()::text);
