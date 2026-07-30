-- 0063: „Szukaj teraz" dla wszystkich kategorii + zapraszanie poszukiwaczy do eventu.
--
-- 1) play_seekers dostaje kolumnę `category` (sport / hobby / rekreacja / kultura / muzyka / edukacja / biznes / inne).
-- 2) join_play_queue / list_play_seekers obsługują kategorię (a `sport` staje się dowolną podkategorią).
-- 3) Nowa funkcja list_event_invite_seekers — lista poszukiwaczy pasujących preferencjami do danego eventu,
--    którą widzi tylko organizator (do zapraszania ze szczegółów eventu).

alter table public.play_seekers
  add column if not exists category text not null default 'sport';

create index if not exists play_seekers_category_idx on public.play_seekers (category);

-- --- join_play_queue: dodanie kategorii, podkategoria (sport) jest teraz dowolna ---
drop function if exists public.join_play_queue(text, text, double precision, double precision, text, integer);

create or replace function public.join_play_queue(
  p_category text default 'sport',
  p_sport text default null,
  p_skill text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_note text default null,
  p_ttl_minutes integer default 120
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_categories text[] := array['sport','hobby','rekreacja','kultura','muzyka','edukacja','biznes','inne'];
  v_category text := coalesce(nullif(trim(coalesce(p_category, '')), ''), 'sport');
begin
  if v_uid is null then return 'not_authenticated'; end if;
  if not (v_category = any(v_categories)) then return 'invalid_category'; end if;
  if p_skill is not null and p_skill not in ('beginner','intermediate','advanced') then return 'invalid_skill'; end if;

  insert into public.play_seekers (user_id, category, sport, skill, note, lat, lng, created_at, expires_at)
  values (
    v_uid,
    v_category,
    nullif(trim(coalesce(p_sport, '')), ''),
    p_skill,
    nullif(trim(coalesce(p_note, '')), ''),
    p_lat,
    p_lng,
    now(),
    now() + make_interval(mins => greatest(15, least(p_ttl_minutes, 360)))
  )
  on conflict (user_id) do update set
    category = excluded.category,
    sport = excluded.sport,
    skill = excluded.skill,
    note = excluded.note,
    lat = excluded.lat,
    lng = excluded.lng,
    created_at = now(),
    expires_at = excluded.expires_at;

  update public.profiles set play_status = 'looking', play_status_at = now() where id = v_uid;
  return 'ok';
end; $function$;

-- --- list_play_seekers: filtr po kategorii + zwrot kategorii ---
drop function if exists public.list_play_seekers(double precision, double precision, text, integer);

create or replace function public.list_play_seekers(
  p_lat double precision default null,
  p_lng double precision default null,
  p_category text default null,
  p_sport text default null,
  p_limit integer default 50
)
returns table(
  user_id uuid,
  nick text,
  avatar_url text,
  category text,
  sport text,
  skill text,
  note text,
  distance_m double precision,
  created_at timestamptz,
  is_online boolean
)
language sql
stable security definer
set search_path to 'public'
as $function$
  select s.user_id, p.nick, p.avatar_url, s.category, s.sport, s.skill, s.note,
    case when p_lat is not null and p_lng is not null and s.lat is not null and s.lng is not null then
      st_distance(
        st_setsrid(st_makepoint(s.lng, s.lat), 4326)::geography,
        st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
      ) else null end as distance_m,
    s.created_at,
    (p.last_seen_at is not null and p.last_seen_at > now() - interval '5 minutes') as is_online
  from public.play_seekers s
  join public.profiles p on p.id = s.user_id
  where auth.uid() is not null
    and s.expires_at > now()
    and s.user_id <> auth.uid()
    and (p_category is null or coalesce(s.category, 'sport') = p_category)
    and (p_sport is null or s.sport is null or s.sport = p_sport)
  order by distance_m asc nulls last, s.created_at desc
  limit greatest(1, least(p_limit, 100));
$function$;

-- --- list_event_invite_seekers: poszukiwacze pasujący do eventu (tylko dla organizatora) ---
create or replace function public.list_event_invite_seekers(
  p_event_id uuid,
  p_limit integer default 50
)
returns table(
  user_id uuid,
  nick text,
  avatar_url text,
  category text,
  sport text,
  skill text,
  note text,
  distance_m double precision,
  created_at timestamptz,
  is_online boolean
)
language sql
stable security definer
set search_path to 'public'
as $function$
  with ev as (
    select
      e.id,
      e.creator_id,
      coalesce(e.category, 'sport') as category,
      e.subcategory,
      coalesce(e.lat, st_y(f.geom::geometry)) as elat,
      coalesce(e.lng, st_x(f.geom::geometry)) as elng
    from public.events e
    left join public.fields f on f.id = e.field_id
    where e.id = p_event_id
  )
  select s.user_id, p.nick, p.avatar_url, s.category, s.sport, s.skill, s.note,
    case when ev.elat is not null and ev.elng is not null and s.lat is not null and s.lng is not null then
      st_distance(
        st_setsrid(st_makepoint(s.lng, s.lat), 4326)::geography,
        st_setsrid(st_makepoint(ev.elng, ev.elat), 4326)::geography
      ) else null end as distance_m,
    s.created_at,
    (p.last_seen_at is not null and p.last_seen_at > now() - interval '5 minutes') as is_online
  from ev
  join public.play_seekers s on s.expires_at > now()
  join public.profiles p on p.id = s.user_id
  where auth.uid() is not null
    and ev.creator_id = auth.uid()
    and s.user_id <> ev.creator_id
    and coalesce(s.category, 'sport') = ev.category
    and (ev.subcategory is null or s.sport is null or s.sport = ev.subcategory)
    and not exists (
      select 1 from public.event_participants epp
      where epp.event_id = ev.id and epp.user_id = s.user_id
    )
    and not exists (
      select 1 from public.event_user_invitations i
      where i.event_id = ev.id and i.to_user_id = s.user_id and i.status = 'pending'
    )
  order by distance_m asc nulls last, s.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$function$;

grant execute on function public.list_event_invite_seekers(uuid, integer) to authenticated;
