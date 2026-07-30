-- 0061 — Filtr mapy dla nowych kategorii obiektów (0060).
--
-- Grupujemy warianty tagów OSM pod jeden filtr:
--   running    → 'running', 'athletics'
--   volleyball → 'volleyball', 'beachvolleyball'
--   skatepark  → 'skatepark', 'skateboard'
-- Pozostałe (fitness, swimming, climbing, music_club) dopasowują się przez
-- domyślną gałąź (równość klucza), bo zapisujemy je dokładnie taką nazwą.

create or replace function public.field_matches_sport_filter(sport text, sport_filter text)
returns boolean
language sql
immutable
as $$
  select case
    when sport_filter is null then true
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
$$;

grant execute on function public.field_matches_sport_filter(text, text) to authenticated;

notify pgrst, 'reload schema';
