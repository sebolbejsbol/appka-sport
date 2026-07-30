-- 0064: Obiekty na mapie dla wszystkich kategorii (nie tylko sport).
--
-- 1) field_matches_sport_filter akceptuje listę typów po przecinku (np. "theatre,cinema,museum,library"),
--    dzięki czemu po wybraniu kategorii (kultura, muzyka, edukacja, biznes, hobby, rekreacja) mapa
--    pokazuje wszystkie pasujące typy obiektów naraz.
-- 2) import_osm_fields(p_query, p_type) — server-side import obiektów z OpenStreetMap (Overpass API
--    przez rozszerzenie http), przycięty do granic Polski (voivodeship_boundaries), z nazwą i województwem.
--    Użyte do uzupełnienia mapy o teatry, kina, muzea, biblioteki, domy kultury, coworkingi, centra
--    konferencyjne, galerie sztuki, pracownie ceramiki/fotografii, parki, sale koncertowe, korty do
--    badmintona/padla, boiska do piłki ręcznej itd.

create or replace function public.field_matches_sport_filter(sport text, sport_filter text)
 returns boolean
 language sql
 immutable
as $function$
  select case
    when sport_filter is null then true
    when position(',' in sport_filter) > 0 then (
      select bool_or(public.field_matches_sport_filter(sport, btrim(tok)))
      from unnest(string_to_array(sport_filter, ',')) as tok
    )
    when sport_filter = 'basketball' then
      coalesce(sport, '') = 'basketball'
      or 'basketball' = any(string_to_array(coalesce(sport, ''), ';'))
      or coalesce(sport, '') = 'multi'
    when sport_filter = 'football' then
      coalesce(sport, '') in ('football', 'soccer')
      or 'football' = any(string_to_array(coalesce(sport, ''), ';'))
      or 'soccer' = any(string_to_array(coalesce(sport, ''), ';'))
    when sport_filter = 'tennis' then
      coalesce(sport, '') = 'tennis'
      or 'tennis' = any(string_to_array(coalesce(sport, ''), ';'))
    when sport_filter = 'volleyball' then
      coalesce(sport, '') in ('volleyball', 'beachvolleyball')
      or 'volleyball' = any(string_to_array(coalesce(sport, ''), ';'))
      or 'beachvolleyball' = any(string_to_array(coalesce(sport, ''), ';'))
    when sport_filter = 'running' then
      coalesce(sport, '') in ('running', 'athletics')
      or 'running' = any(string_to_array(coalesce(sport, ''), ';'))
      or 'athletics' = any(string_to_array(coalesce(sport, ''), ';'))
    when sport_filter = 'skatepark' then
      coalesce(sport, '') in ('skatepark', 'skateboard')
      or 'skateboard' = any(string_to_array(coalesce(sport, ''), ';'))
    else
      coalesce(sport, '') = sport_filter
      or sport_filter = any(string_to_array(coalesce(sport, ''), ';'))
  end;
$function$;

create or replace function public.import_osm_fields(p_query text, p_type text)
returns integer
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_content text;
  v_status integer;
  v_resp jsonb;
  v_inserted integer := 0;
begin
  perform http_set_curlopt('CURLOPT_TIMEOUT', '300');
  select (r).status, (r).content
    into v_status, v_content
  from (
    select http((
      'POST',
      'https://overpass-api.de/api/interpreter',
      array[http_header('User-Agent', 'DudieDayImport/1.0')],
      'application/x-www-form-urlencoded',
      'data=' || p_query
    )::http_request) as r
  ) s;

  if v_status <> 200 then
    raise exception 'overpass status % : %', v_status, left(coalesce(v_content, ''), 200);
  end if;
  if v_content is null or left(ltrim(v_content), 1) <> '{' then
    raise exception 'overpass non-json: %', left(coalesce(v_content, ''), 200);
  end if;

  v_resp := v_content::jsonb;

  with elems as (
    select e from jsonb_array_elements(v_resp->'elements') as e
  ),
  pts as (
    select
      (e->>'type') as osm_type,
      (e->>'id')::bigint as osm_id,
      coalesce((e->>'lat')::float8, (e#>>'{center,lat}')::float8) as lat,
      coalesce((e->>'lon')::float8, (e#>>'{center,lon}')::float8) as lon,
      e->'tags' as tags
    from elems e
  ),
  named as (
    select osm_type, osm_id, lat, lon,
      coalesce(
        nullif(trim(tags->>'name'), ''),
        nullif(trim(tags->>'official_name'), ''),
        nullif(trim(tags->>'brand'), ''),
        nullif(trim(tags->>'operator'), '')
      ) as nm
    from pts
    where lat is not null and lon is not null
      and osm_type in ('node','way','relation')
  ),
  withvoi as (
    select n.osm_type, n.osm_id, n.nm, vb.voivodeship,
      st_setsrid(st_makepoint(n.lon, n.lat), 4326) as geom
    from named n
    join public.voivodeship_boundaries vb
      on st_contains(vb.geom, st_setsrid(st_makepoint(n.lon, n.lat), 4326))
  ),
  ins as (
    insert into public.fields (osm_type, osm_id, name, sport, geom, status, source, voivodeship, created_at, updated_at)
    select osm_type, osm_id, nm, p_type, geom, 'approved', 'osm', voivodeship, now(), now()
    from withvoi
    on conflict (osm_type, osm_id) where (osm_type is not null and osm_id is not null) do nothing
    returning 1
  )
  select count(*) into v_inserted from ins;

  return v_inserted;
end;
$$;
