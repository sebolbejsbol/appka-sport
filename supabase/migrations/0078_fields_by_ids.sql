-- Migracja 0078: fields_by_ids — pobiera konkretne boiska po id, niezależnie
-- od bbox/filtra sportu. Używane do wymuszenia widoczności ulubionych boisk
-- na mapie, nawet gdy aktualne filtry (dyscyplina, viewport) by je ukryły.
-- Uruchom w Supabase: Dashboard -> SQL Editor -> New query -> wklej całość -> Run.
-- Idempotentna (bezpieczna do ponownego uruchomienia).

create or replace function public.fields_by_ids(p_ids uuid[])
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
    null::numeric as avg_rating,
    0::bigint as rating_count
  from public.fields f
  where f.status = 'approved'
    and f.id = any(p_ids);
$$;

grant execute on function public.fields_by_ids(uuid[]) to authenticated;

notify pgrst, 'reload schema';
