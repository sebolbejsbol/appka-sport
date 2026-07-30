-- ═══════════════════════════════════════════════════════════════════════════
-- 0044 — Oceny boisk
-- Kategoria: Boiska  |  Typ: FEATURE  |  Wymaga: 0005
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.field_ratings (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references public.fields (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  surface_score smallint not null,
  lighting_score smallint not null,
  cleanliness_score smallint not null,
  accessibility_score smallint not null,
  safety_score smallint not null,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint field_ratings_user_field_unique unique (field_id, user_id),
  constraint field_ratings_surface_check check (surface_score between 1 and 5),
  constraint field_ratings_lighting_check check (lighting_score between 1 and 5),
  constraint field_ratings_cleanliness_check check (cleanliness_score between 1 and 5),
  constraint field_ratings_accessibility_check check (accessibility_score between 1 and 5),
  constraint field_ratings_safety_check check (safety_score between 1 and 5),
  constraint field_ratings_comment_len check (
    comment is null or char_length(comment) <= 500
  )
);

create index if not exists field_ratings_field_idx
  on public.field_ratings (field_id, created_at desc);

create index if not exists field_ratings_user_idx
  on public.field_ratings (user_id);

drop trigger if exists field_ratings_set_updated_at on public.field_ratings;
create trigger field_ratings_set_updated_at
  before update on public.field_ratings
  for each row execute function public.set_updated_at();

alter table public.field_ratings enable row level security;

drop policy if exists field_ratings_select on public.field_ratings;
create policy field_ratings_select on public.field_ratings
  for select to authenticated
  using (true);

revoke insert, update, delete on public.field_ratings from authenticated;
grant select on public.field_ratings to authenticated;

-- ─── Helpers ───────────────────────────────────────────────────────────────

create or replace function public.field_rating_overall(
  p_surface smallint,
  p_lighting smallint,
  p_cleanliness smallint,
  p_accessibility smallint,
  p_safety smallint
)
returns numeric
language sql
immutable
as $$
  select round(
    (p_surface + p_lighting + p_cleanliness + p_accessibility + p_safety)::numeric / 5.0,
    1
  );
$$;

create or replace function public.field_rating_score_valid(p_score smallint)
returns boolean
language sql
immutable
as $$
  select p_score between 1 and 5;
$$;

-- ─── Submit / update own rating ────────────────────────────────────────────

create or replace function public.submit_field_rating(
  p_field_id uuid,
  p_surface_score smallint,
  p_lighting_score smallint,
  p_cleanliness_score smallint,
  p_accessibility_score smallint,
  p_safety_score smallint,
  p_comment text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_comment text := nullif(trim(coalesce(p_comment, '')), '');
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_field_id is null then
    raise exception 'invalid_field';
  end if;

  if not exists (
    select 1 from public.fields f
    where f.id = p_field_id and f.status = 'approved'
  ) then
    raise exception 'invalid_field';
  end if;

  if not public.field_rating_score_valid(p_surface_score)
    or not public.field_rating_score_valid(p_lighting_score)
    or not public.field_rating_score_valid(p_cleanliness_score)
    or not public.field_rating_score_valid(p_accessibility_score)
    or not public.field_rating_score_valid(p_safety_score)
  then
    raise exception 'invalid_score';
  end if;

  if v_comment is not null and char_length(v_comment) > 500 then
    raise exception 'invalid_comment';
  end if;

  insert into public.field_ratings (
    field_id,
    user_id,
    surface_score,
    lighting_score,
    cleanliness_score,
    accessibility_score,
    safety_score,
    comment
  )
  values (
    p_field_id,
    v_uid,
    p_surface_score,
    p_lighting_score,
    p_cleanliness_score,
    p_accessibility_score,
    p_safety_score,
    v_comment
  )
  on conflict (field_id, user_id) do update set
    surface_score = excluded.surface_score,
    lighting_score = excluded.lighting_score,
    cleanliness_score = excluded.cleanliness_score,
    accessibility_score = excluded.accessibility_score,
    safety_score = excluded.safety_score,
    comment = excluded.comment,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

-- ─── Summary for a field ───────────────────────────────────────────────────

create or replace function public.field_rating_summary(p_field_id uuid)
returns table (
  rating_count bigint,
  avg_rating numeric,
  surface_avg numeric,
  lighting_avg numeric,
  cleanliness_avg numeric,
  accessibility_avg numeric,
  safety_avg numeric,
  my_surface_score smallint,
  my_lighting_score smallint,
  my_cleanliness_score smallint,
  my_accessibility_score smallint,
  my_safety_score smallint,
  my_comment text
)
language sql
stable
security definer
set search_path = public
as $$
  with agg as (
    select
      count(*)::bigint as rating_count,
      round(avg(public.field_rating_overall(
        fr.surface_score,
        fr.lighting_score,
        fr.cleanliness_score,
        fr.accessibility_score,
        fr.safety_score
      )), 1) as avg_rating,
      round(avg(fr.surface_score), 1) as surface_avg,
      round(avg(fr.lighting_score), 1) as lighting_avg,
      round(avg(fr.cleanliness_score), 1) as cleanliness_avg,
      round(avg(fr.accessibility_score), 1) as accessibility_avg,
      round(avg(fr.safety_score), 1) as safety_avg
    from public.field_ratings fr
    where fr.field_id = p_field_id
  ),
  mine as (
    select
      fr.surface_score,
      fr.lighting_score,
      fr.cleanliness_score,
      fr.accessibility_score,
      fr.safety_score,
      fr.comment
    from public.field_ratings fr
    where fr.field_id = p_field_id
      and fr.user_id = auth.uid()
    limit 1
  )
  select
    coalesce(a.rating_count, 0),
    a.avg_rating,
    a.surface_avg,
    a.lighting_avg,
    a.cleanliness_avg,
    a.accessibility_avg,
    a.safety_avg,
    m.surface_score,
    m.lighting_score,
    m.cleanliness_score,
    m.accessibility_score,
    m.safety_score,
    m.comment
  from agg a
  left join mine m on true;
$$;

-- ─── List reviews ──────────────────────────────────────────────────────────

create or replace function public.list_field_ratings(
  p_field_id uuid,
  p_limit integer default 30
)
returns table (
  id uuid,
  user_id uuid,
  nick text,
  surface_score smallint,
  lighting_score smallint,
  cleanliness_score smallint,
  accessibility_score smallint,
  safety_score smallint,
  overall_score numeric,
  comment text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    fr.id,
    fr.user_id,
    p.nick,
    fr.surface_score,
    fr.lighting_score,
    fr.cleanliness_score,
    fr.accessibility_score,
    fr.safety_score,
    public.field_rating_overall(
      fr.surface_score,
      fr.lighting_score,
      fr.cleanliness_score,
      fr.accessibility_score,
      fr.safety_score
    ) as overall_score,
    fr.comment,
    fr.created_at
  from public.field_ratings fr
  left join public.profiles p on p.id = fr.user_id
  where fr.field_id = p_field_id
    and not public.i_blocked_user(auth.uid(), fr.user_id)
  order by fr.created_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;

-- ─── fields_in_bbox with ratings + sort ────────────────────────────────────

drop function if exists public.fields_in_bbox(
  double precision, double precision, double precision, double precision, integer, text
);

create or replace function public.fields_in_bbox(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision,
  max_rows integer default 500,
  sport_filter text default 'basketball',
  sort_by text default 'default'
)
returns table (
  id uuid,
  name text,
  sport text,
  lng double precision,
  lat double precision,
  avg_rating numeric,
  rating_count bigint
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
    r.avg_rating,
    coalesce(r.rating_count, 0) as rating_count
  from public.fields f
  left join lateral (
    select
      count(*)::bigint as rating_count,
      round(avg(public.field_rating_overall(
        fr.surface_score,
        fr.lighting_score,
        fr.cleanliness_score,
        fr.accessibility_score,
        fr.safety_score
      )), 1) as avg_rating
    from public.field_ratings fr
    where fr.field_id = f.id
  ) r on true
  where f.status = 'approved'
    and f.geom && st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography
    and public.field_matches_sport_filter(f.sport, sport_filter)
  order by
    case when coalesce(sort_by, 'default') = 'rating' then coalesce(r.avg_rating, 0) end desc,
    case when coalesce(sort_by, 'default') = 'rating' then coalesce(r.rating_count, 0) end desc,
    f.name nulls last
  limit max_rows;
$$;

grant execute on function public.field_rating_overall(smallint, smallint, smallint, smallint, smallint) to authenticated;
grant execute on function public.submit_field_rating(uuid, smallint, smallint, smallint, smallint, smallint, text) to authenticated;
grant execute on function public.field_rating_summary(uuid) to authenticated;
grant execute on function public.list_field_ratings(uuid, integer) to authenticated;
grant execute on function public.fields_in_bbox(
  double precision, double precision, double precision, double precision, integer, text, text
) to authenticated;

notify pgrst, 'reload schema';
