// Generuje migrację z realną granicą Trójmiasta (Gdańsk + Sopot + Gdynia,
// unia + 6km bufor na Rumię/Redę/Pruszcz Gdański) zamiast okręgu.
// Źródło: powiaty (miasta na prawach powiatu = dokładnie granice miast)
// z https://github.com/ppatrzyk/polska-geojson.
//
// Użycie: node scripts/osm-poland/tricity-boundary.mjs
// Zapisuje supabase/migrations/0102_tricity_real_boundary.sql (nie aplikuje sam).

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const GEOJSON_URL =
  'https://raw.githubusercontent.com/ppatrzyk/polska-geojson/master/powiaty/powiaty-medium.geojson';
const WANTED = ['powiat Gdańsk', 'powiat Gdynia', 'powiat Sopot'];
const BUFFER_METERS = 10000;
const OUT = join(ROOT, 'supabase/migrations/0102_tricity_real_boundary.sql');

function sqlStr(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

async function main() {
  console.log('Pobieram granice powiatów…');
  const res = await fetch(GEOJSON_URL, { headers: { 'User-Agent': 'dudieday/1.0' } });
  if (!res.ok) throw new Error(`GeoJSON HTTP ${res.status}`);
  const gj = JSON.parse(await res.text());
  const feats = gj.features.filter((f) => WANTED.includes(f.properties?.nazwa));
  if (feats.length !== WANTED.length) {
    throw new Error(`Znaleziono ${feats.length}/${WANTED.length} — sprawdź nazwy w źródle.`);
  }
  console.log('Znalezione:', feats.map((f) => f.properties.nazwa).join(', '));

  const unionArgs = feats
    .map((f) => `st_geomfromgeojson(${sqlStr(JSON.stringify(f.geometry))})`)
    .join(',\n        ');

  const migration = `-- Migracja 0102: prawdziwa granica Trójmiasta zamiast okręgu 25km.
--
-- WYGENEROWANE: scripts/osm-poland/tricity-boundary.mjs (dane: powiaty
-- Gdańsk/Gdynia/Sopot z https://github.com/ppatrzyk/polska-geojson —
-- każde z tych 3 miast JEST osobnym powiatem grodzkim, więc granica
-- powiatu = dokładnie granica miasta).
--
-- Użytkownik: "nie podoba mi się ta strefa w postaci kółka, przytnij to
-- regionowo, bo kółko wygląda słabo". Zamiast okręgu o promieniu 25km od
-- jednego punktu (0092/0099/0101), granica to teraz UNIA realnych granic
-- Gdańska+Sopotu+Gdyni + ${BUFFER_METERS / 1000}km bufor (ST_Buffer na geography, czyli
-- poprawnie w metrach) — margines celowo zachowany, żeby nie stracić
-- Rumi/Redy/Pruszcza Gdańskiego, które 0092 wcześniej świadomie
-- uwzględniał jako "najbliższą okolicę".
--
-- JEDNO miejsce prawdy: geometria liczona RAZ i zapisana w
-- public.tricity_boundary, wszystkie 4 miejsca (fields_in_bbox,
-- event_counts_in_bbox, event_counts_by_category_in_bbox,
-- validate_event_before_insert, locked_voivodeship_boundaries) tylko ją
-- odczytują — żadne z nich nie liczy unii/bufora samodzielnie.
--
-- Uruchom w Supabase: Dashboard -> SQL Editor -> New query -> wklej całość -> Run,
-- albo: node scripts/run-supabase-sql.mjs supabase/migrations/0102_tricity_real_boundary.sql

create table if not exists public.tricity_boundary (
  id text primary key default 'tricity',
  geom geometry(Geometry, 4326) not null,
  updated_at timestamptz not null default now()
);

insert into public.tricity_boundary (id, geom)
values (
  'tricity',
  st_buffer(
    st_union(array[
        ${unionArgs}
    ])::geography,
    ${BUFFER_METERS}
  )::geometry
)
on conflict (id) do update set geom = excluded.geom, updated_at = now();

create index if not exists tricity_boundary_gix on public.tricity_boundary using gist (geom);

-- ─── fields_in_bbox / event_counts_in_bbox / event_counts_by_category_in_bbox:
-- zamiana st_dwithin(..., 25000) na sprawdzenie względem realnej granicy ───

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
      select 1 from public.tricity_boundary t
      where t.id = 'tricity' and st_intersects(f.geom::geometry, t.geom)
    )
  order by md5(f.id::text)
  limit max_rows;
$$;

grant execute on function public.fields_in_bbox(double precision, double precision, double precision, double precision, integer, text, text) to authenticated;

create or replace function public.event_counts_in_bbox(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision,
  sport_filter text default 'basketball'
)
returns table(field_id uuid, event_count bigint, availability text)
language sql
stable
security definer
set search_path to 'public'
as $$
  with per_event as (
    select
      e.field_id,
      e.max_players,
      (select count(*)::int from public.event_participants ep where ep.event_id = e.id) as participants
    from public.events e
    inner join public.fields f on f.id = e.field_id
    where e.status = 'planned'
      and e.starts_at > now() - interval '3 hours'
      and f.status = 'approved'
      and public.field_matches_sport_filter(f.sport, sport_filter)
      and f.geom && st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography
      and exists (
        select 1 from public.tricity_boundary t
        where t.id = 'tricity' and st_intersects(f.geom::geometry, t.geom)
      )
  ),
  per_event_status as (
    select
      field_id,
      case
        when max_players is null then 'open'
        when participants >= max_players then 'full'
        when (max_players - participants) <= 1
          or participants::numeric / max_players >= 0.75 then 'filling'
        else 'open'
      end as status
    from per_event
  )
  select
    field_id,
    count(*)::bigint as event_count,
    case
      when bool_or(status = 'open') then 'open'
      when bool_or(status = 'filling') then 'filling'
      else 'full'
    end as availability
  from per_event_status
  group by field_id;
$$;

grant execute on function public.event_counts_in_bbox(double precision, double precision, double precision, double precision, text) to authenticated;

create or replace function public.event_counts_by_category_in_bbox(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision
)
returns table(field_id uuid, sport text, event_count bigint, availability text)
language sql
stable
security definer
set search_path to 'public'
as $$
  with per_event as (
    select
      e.field_id,
      e.sport,
      e.max_players,
      (select count(*)::int from public.event_participants ep where ep.event_id = e.id) as participants
    from public.events e
    inner join public.fields f on f.id = e.field_id
    where e.status = 'planned'
      and e.starts_at > now() - interval '3 hours'
      and f.status = 'approved'
      and f.geom && st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography
      and exists (
        select 1 from public.tricity_boundary t
        where t.id = 'tricity' and st_intersects(f.geom::geometry, t.geom)
      )
  ),
  per_event_status as (
    select
      field_id,
      sport,
      case
        when max_players is null then 'open'
        when participants >= max_players then 'full'
        when (max_players - participants) <= 1
          or participants::numeric / max_players >= 0.75 then 'filling'
        else 'open'
      end as status
    from per_event
  )
  select
    field_id,
    sport,
    count(*)::bigint as event_count,
    case
      when bool_or(status = 'open') then 'open'
      when bool_or(status = 'filling') then 'filling'
      else 'full'
    end as availability
  from per_event_status
  group by field_id, sport;
$$;

revoke all on function public.event_counts_by_category_in_bbox(double precision, double precision, double precision, double precision) from public;
grant execute on function public.event_counts_by_category_in_bbox(double precision, double precision, double precision, double precision) to authenticated;

-- ─── validate_event_before_insert: promień 25km -> realna granica ───

create or replace function public.validate_event_before_insert()
returns trigger
language plpgsql
as $$
declare
  v_within_tricity boolean;
begin
  if coalesce(new.is_instant, false) = false then
    if new.category is null or char_length(btrim(new.category)) = 0 then
      raise exception 'EVENT_CATEGORY_REQUIRED';
    end if;
    if new.category <> 'inne' and (new.subcategory is null or char_length(btrim(new.subcategory)) = 0) then
      raise exception 'EVENT_SUBCATEGORY_REQUIRED';
    end if;
    if new.title is null or char_length(btrim(new.title)) < 3 then
      raise exception 'EVENT_TITLE_REQUIRED';
    end if;
    if new.lat is null or new.lng is null then
      raise exception 'EVENT_LOCATION_REQUIRED';
    end if;
    if new.starts_at is null then
      raise exception 'EVENT_START_REQUIRED';
    end if;
  end if;

  if new.lat is not null and new.lng is not null then
    select st_intersects(
      st_setsrid(st_makepoint(new.lng, new.lat), 4326),
      t.geom
    )
    into v_within_tricity
    from public.tricity_boundary t
    where t.id = 'tricity';

    if coalesce(v_within_tricity, false) = false then
      raise exception 'EVENT_LOCATION_OUTSIDE_TRICITY';
    end if;
  end if;

  return new;
end;
$$;

-- ─── locked_voivodeship_boundaries: okrąg -> realna granica ───

create or replace function public.locked_voivodeship_boundaries(p_active_voivodeship text default 'pomorskie')
returns table (voivodeship text, geojson text)
language sql
stable
as $$
  select
    'outside_tricity'::text as voivodeship,
    st_asgeojson(
      st_difference(
        st_makeenvelope(-25, 25, 45, 72, 4326),
        (select geom from public.tricity_boundary where id = 'tricity')
      )
    ) as geojson;
$$;

notify pgrst, 'reload schema';
`;

  writeFileSync(OUT, migration, 'utf8');
  console.log('Zapisano:', OUT);
}

main().catch((e) => {
  console.error('Błąd:', e.message || e);
  process.exit(1);
});
