-- Migracja 0022: rozszerzona moderacja boisk (nazwa, powód odrzucenia, pobliskie duplikaty)
-- Uruchom w Supabase: SQL Editor → Run.
-- Wymaga: 0013, 0018.

alter table public.fields
  add column if not exists admin_note text;

comment on column public.fields.admin_note is 'Uwaga administratora przy odrzuceniu lub moderacji.';

-- Kolejka admina z notatką
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
  admin_note text
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
    f.admin_note
  from public.fields f
  left join public.profiles p on p.id = f.submitted_by
  where f.status = coalesce(nullif(p_status, ''), 'pending')
  order by f.created_at asc
  limit least(greatest(coalesce(p_max_rows, 50), 1), 100);
end;
$$;

grant execute on function public.admin_fields_queue(text, integer) to authenticated;

-- Zatwierdzone boiska w pobliżu (wykrywanie duplikatów)
create or replace function public.admin_nearby_fields(
  p_field_id uuid,
  p_radius_m double precision default 80,
  p_max_rows integer default 5
)
returns table (
  id uuid,
  name text,
  sport text,
  distance_m double precision,
  lng double precision,
  lat double precision
)
language plpgsql
stable
as $$
declare
  v_geom geography;
begin
  if not public.is_app_admin() then
    raise exception 'not_admin';
  end if;

  select f.geom into v_geom
  from public.fields f
  where f.id = p_field_id;

  if v_geom is null then
    raise exception 'field_not_found';
  end if;

  return query
  select
    f.id,
    f.name,
    f.sport,
    st_distance(f.geom, v_geom)::double precision as distance_m,
    st_x(f.geom::geometry) as lng,
    st_y(f.geom::geometry) as lat
  from public.fields f
  where f.id <> p_field_id
    and f.status = 'approved'
    and st_dwithin(f.geom, v_geom, greatest(coalesce(p_radius_m, 80), 10))
  order by st_distance(f.geom, v_geom)
  limit least(greatest(coalesce(p_max_rows, 5), 1), 10);
end;
$$;

grant execute on function public.admin_nearby_fields(uuid, double precision, integer) to authenticated;

-- Moderacja: opcjonalna zmiana nazwy przy akceptacji + notatka admina
drop function if exists public.moderate_field(uuid, text);

create or replace function public.moderate_field(
  p_field_id uuid,
  p_status text,
  p_name text default null,
  p_admin_note text default null
)
returns void
language plpgsql
as $$
declare
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_note text := nullif(trim(coalesce(p_admin_note, '')), '');
begin
  if not public.is_app_admin() then
    raise exception 'not_admin';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'invalid_status';
  end if;

  if v_name is not null and (char_length(v_name) < 2 or char_length(v_name) > 120) then
    raise exception 'invalid_name';
  end if;

  if v_note is not null and char_length(v_note) > 400 then
    raise exception 'invalid_admin_note';
  end if;

  update public.fields
  set
    status = p_status,
    name = case
      when p_status = 'approved' and v_name is not null then v_name
      else name
    end,
    admin_note = v_note
  where id = p_field_id
    and status = 'pending';

  if not found then
    raise exception 'field_not_found_or_not_pending';
  end if;
end;
$$;

grant execute on function public.moderate_field(uuid, text, text, text) to authenticated;

notify pgrst, 'reload schema';
