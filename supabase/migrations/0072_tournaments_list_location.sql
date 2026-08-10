-- Migracja 0072: list_tournaments zwraca też latitude/longitude
-- (potrzebne do wyświetlenia pinezki turnieju na mapie w ekranie Eventy).
-- Uruchom w Supabase: Dashboard -> SQL Editor -> New query -> wklej całość -> Run.
-- Idempotentna (bezpieczna do ponownego uruchomienia).

drop function if exists public.list_tournaments(text, boolean, integer, integer);

create function public.list_tournaments(
  p_status_filter text default null,
  p_admin_view boolean default false,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid, name text, logo_url text, sport text,
  event_date date, start_time time, end_time time,
  location_name text, city text,
  latitude double precision, longitude double precision,
  status text, max_teams integer, min_teams integer, created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if p_admin_view and not public.is_app_admin() then
    raise exception 'not_admin';
  end if;

  return query
  select
    t.id, t.name, t.logo_url, t.sport,
    t.event_date, t.start_time, t.end_time,
    t.location_name, t.city,
    t.latitude, t.longitude,
    t.status, t.max_teams, t.min_teams, t.created_at,
    count(*) over() as total_count
  from public.tournaments t
  where
    (p_admin_view or t.status not in ('draft', 'cancelled'))
    and (p_status_filter is null or t.status = p_status_filter)
  order by t.event_date desc, t.created_at desc
  limit v_limit
  offset v_offset;
end;
$$;

revoke all on function public.list_tournaments(text, boolean, integer, integer) from public;
grant execute on function public.list_tournaments(text, boolean, integer, integer) to authenticated;

notify pgrst, 'reload schema';
