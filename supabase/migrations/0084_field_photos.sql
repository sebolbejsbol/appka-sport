-- Migracja 0084: zdjęcie boiska. Dodaje kolumnę photo_url na public.fields,
-- bucket Storage field-photos (wzorowany 1:1 na team-logos z 0032_teams.sql)
-- oraz zwraca photo_url z fields_in_bbox / fields_by_ids, żeby dotarło do
-- karty szczegółów boiska na mapie. Upload zdjęcia jest funkcją admina —
-- taką samą, jak reszta edycji boisk (moderate_field), więc autoryzacja
-- storage.objects opiera się na tym samym public.is_app_admin(), a nie na
-- nowym RPC (admini już mają UPDATE na public.fields z 0013_admin_fields.sql).
-- Uruchom w Supabase: Dashboard -> SQL Editor -> New query -> wklej całość -> Run,
-- albo: node scripts/run-supabase-sql.mjs supabase/migrations/0084_field_photos.sql

alter table public.fields add column if not exists photo_url text;

-- ─── fields_in_bbox / fields_by_ids: zwróć też photo_url ─────────────────────
-- (dodanie kolumny do zwracanego typu wymaga drop + create, nie samego
-- create or replace — Postgres nie pozwala zmieniać OUT parameters w miejscu)

drop function if exists public.fields_in_bbox(double precision, double precision, double precision, double precision, integer, text, text);

create or replace function public.fields_in_bbox(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision,
  max_rows integer default 500,
  sport_filter text default 'basketball',
  sort_by text default 'default'
)
returns table(
  id uuid,
  name text,
  sport text,
  lng double precision,
  lat double precision,
  avg_rating numeric,
  rating_count bigint,
  photo_url text
)
language sql
stable
as $$
  select
    f.id,
    f.name,
    f.sport,
    st_x(f.geom::geometry) as lng,
    st_y(f.geom::geometry) as lat,
    null::numeric as avg_rating,
    0::bigint as rating_count,
    f.photo_url
  from public.fields f
  where f.status = 'approved'
    and f.geom && st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography
    and public.field_matches_sport_filter(f.sport, sport_filter)
    and exists (
      select 1 from public.voivodeship_boundaries v
      where v.voivodeship = 'pomorskie' and st_intersects(f.geom::geometry, v.geom)
    )
  order by md5(f.id::text)
  limit max_rows;
$$;

grant execute on function public.fields_in_bbox(double precision, double precision, double precision, double precision, integer, text, text) to authenticated;

drop function if exists public.fields_by_ids(uuid[]);

create or replace function public.fields_by_ids(p_ids uuid[])
returns table (
  id uuid,
  name text,
  sport text,
  lng double precision,
  lat double precision,
  avg_rating numeric,
  rating_count bigint,
  photo_url text
)
language sql
stable
as $$
  select
    f.id,
    f.name,
    f.sport,
    st_x(f.geom::geometry) as lng,
    st_y(f.geom::geometry) as lat,
    null::numeric as avg_rating,
    0::bigint as rating_count,
    f.photo_url
  from public.fields f
  where f.status = 'approved'
    and f.id = any(p_ids);
$$;

grant execute on function public.fields_by_ids(uuid[]) to authenticated;

-- ─── admin_fields_queue: zwróć też photo_url (podgląd/upload w panelu admina) ─

drop function if exists public.admin_fields_queue(text, integer);

create or replace function public.admin_fields_queue(
  p_status text default 'pending',
  p_max_rows integer default 50
)
returns table (
  id uuid,
  name text,
  sport text,
  status text,
  source text,
  lng double precision,
  lat double precision,
  created_at timestamptz,
  user_note text,
  submitted_by_nick text,
  admin_note text,
  photo_url text
)
language plpgsql
stable
as $$
begin
  if not public.is_app_admin() then
    raise exception 'not_admin';
  end if;

  return query
  select
    f.id,
    f.name,
    f.sport,
    f.status,
    f.source,
    st_x(f.geom::geometry) as lng,
    st_y(f.geom::geometry) as lat,
    f.created_at,
    f.user_note,
    p.nick as submitted_by_nick,
    f.admin_note,
    f.photo_url
  from public.fields f
  left join public.profiles p on p.id = f.submitted_by
  where f.status = coalesce(nullif(p_status, ''), 'pending')
  order by f.created_at asc
  limit least(greatest(coalesce(p_max_rows, 50), 1), 100);
end;
$$;

grant execute on function public.admin_fields_queue(text, integer) to authenticated;

-- ─── Storage: zdjęcie boiska (tylko admin, wzorem team-logos) ────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'field-photos',
  'field-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists "Admins upload field photos" on storage.objects;
create policy "Admins upload field photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'field-photos'
    and public.is_app_admin()
  );

drop policy if exists "Admins update field photos" on storage.objects;
create policy "Admins update field photos"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'field-photos'
    and public.is_app_admin()
  );

drop policy if exists "Public read field photos" on storage.objects;
create policy "Public read field photos"
  on storage.objects for select to authenticated
  using (bucket_id = 'field-photos');

notify pgrst, 'reload schema';
