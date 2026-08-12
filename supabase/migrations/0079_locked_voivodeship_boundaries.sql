-- Migracja 0079: granice województw poza Trójmiastem (pomorskie) do
-- narysowania szarej nakładki "Coming soon" na mapie — na razie aktywne
-- jest tylko Pomorskie (Trójmiasto), reszta kraju jest zablokowana.
-- Reużywa istniejącej tabeli public.voivodeship_boundaries (migracja 0053).
-- Uruchom w Supabase: Dashboard -> SQL Editor -> New query -> wklej całość -> Run.
-- Idempotentna (bezpieczna do ponownego uruchomienia).

create or replace function public.locked_voivodeship_boundaries(p_active_voivodeship text default 'pomorskie')
returns table (voivodeship text, geojson text)
language sql
stable
as $$
  select b.voivodeship, st_asgeojson(b.geom)
  from public.voivodeship_boundaries b
  where b.voivodeship <> coalesce(p_active_voivodeship, 'pomorskie');
$$;

grant execute on function public.locked_voivodeship_boundaries(text) to authenticated;

notify pgrst, 'reload schema';
