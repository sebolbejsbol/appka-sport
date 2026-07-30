-- Migracja 0016: dłuższe tytuły i notatki eventów (pełny tekst w szczegółach)
-- Uruchom w Supabase: SQL Editor → Run.

alter table public.events
  drop constraint if exists events_title_length,
  drop constraint if exists events_notes_length;

alter table public.events
  add constraint events_title_length
    check (title is null or char_length(title) <= 80),
  add constraint events_notes_length
    check (notes is null or char_length(notes) <= 400);

notify pgrst, 'reload schema';
