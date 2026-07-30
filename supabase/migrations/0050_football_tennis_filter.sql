-- Migracja 0050: filtr boisk dla piłki nożnej i tenisa (analogicznie do koszykówki w 0005).
-- Uruchom w Supabase: SQL Editor → New query → wklej całość → Run.
--
-- Cel: aby filtr mapy `sport_filter` poprawnie dopasowywał nowe boiska:
--   - 'football' → sport zapisany jako 'football' (import 0051) ORAZ 'soccer' (stare wpisy OSM, np. Trójmiasto 0003)
--   - 'tennis'   → sport zapisany jako 'tennis' (import 0052); 'table_tennis' NIE jest dopasowywany
-- Koszykówka zachowuje dotychczasowe zachowanie (w tym boiska wielofunkcyjne 'multi').

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
    else
      coalesce(sport, '') = sport_filter
      or sport_filter = any(string_to_array(coalesce(sport, ''), ';'))
  end;
$$;

grant execute on function public.field_matches_sport_filter(text, text) to authenticated;

notify pgrst, 'reload schema';
