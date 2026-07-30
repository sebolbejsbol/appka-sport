-- Migracja 0019: naprawa zgłaszania boisk (gdy 0018 przerwała się na admin_fields_queue)
-- Uruchom w Supabase: SQL Editor → Run.
-- Bezpieczna do ponownego uruchomienia.

alter table public.fields
  add column if not exists submitted_by uuid references auth.users (id) on delete set null,
  add column if not exists user_note text;

-- Zmiana typu zwracanego wymaga DROP (uuid → text).
drop function if exists public.submit_field_report(double precision, double precision, text, text, text);

create or replace function public.submit_field_report(
  p_lng double precision,
  p_lat double precision,
  p_name text,
  p_sport text default 'basketball',
  p_note text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := nullif(trim(p_name), '');
  v_sport text := nullif(trim(coalesce(p_sport, 'basketball')), '');
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_id uuid;
  v_point geography;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if v_name is null or char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'invalid_name';
  end if;

  if v_note is not null and char_length(v_note) > 400 then
    raise exception 'invalid_note';
  end if;

  if p_lng is null or p_lat is null
    or p_lng < -180 or p_lng > 180
    or p_lat < -90 or p_lat > 90 then
    raise exception 'invalid_coords';
  end if;

  if v_sport is null then
    v_sport := 'basketball';
  end if;

  v_point := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;

  if exists (
    select 1
    from public.fields f
    where f.status in ('pending', 'approved')
      and st_dwithin(f.geom, v_point, 40)
  ) then
    raise exception 'too_close';
  end if;

  if (
    select count(*)
    from public.fields f
    where f.submitted_by = v_uid
      and f.status = 'pending'
      and f.source = 'user'
  ) >= 10 then
    raise exception 'rate_limit';
  end if;

  insert into public.fields (
    name,
    sport,
    geom,
    status,
    source,
    submitted_by,
    user_note
  )
  values (
    v_name,
    v_sport,
    v_point,
    'pending',
    'user',
    v_uid,
    v_note
  )
  returning id into v_id;

  return v_id::text;
end;
$$;

revoke all on function public.submit_field_report(double precision, double precision, text, text, text) from public;
grant execute on function public.submit_field_report(double precision, double precision, text, text, text) to authenticated;

-- Kolejka admina z nowymi kolumnami (user_note, submitted_by_nick)
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
  submitted_by_nick text
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
    p.nick as submitted_by_nick
  from public.fields f
  left join public.profiles p on p.id = f.submitted_by
  where f.status = coalesce(nullif(p_status, ''), 'pending')
  order by f.created_at asc
  limit least(greatest(coalesce(p_max_rows, 50), 1), 100);
end;
$$;

grant execute on function public.admin_fields_queue(text, integer) to authenticated;

notify pgrst, 'reload schema';
