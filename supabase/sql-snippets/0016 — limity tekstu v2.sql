-- ═══════════════════════════════════════════════════════════════════════════
-- 0016 — Limity tekstu eventu v2
-- Kategoria: Eventy  |  Typ: FIX  |  Wymaga: 0015
-- Plik: supabase/migrations/0016_event_text_limits_v2.sql
-- SQL Editor: 0016 — limity tekstu v2
-- ═══════════════════════════════════════════════════════════════════════════
-- Uruchamiaj w kolejności numerów. Skrypt idempotentny (bezpieczny ponownie).
-- UWAGA: migracja naprawcza — uruchom po 0015.

alter table public.events
  drop constraint if exists events_title_length,
  drop constraint if exists events_notes_length;

alter table public.events
  add constraint events_title_length
    check (title is null or char_length(title) <= 80),
  add constraint events_notes_length
    check (notes is null or char_length(notes) <= 400);

notify pgrst, 'reload schema';
