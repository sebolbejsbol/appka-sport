-- ═══════════════════════════════════════════════════════════════════════════
-- 0015 — Limity tekstu eventu
-- Kategoria: Eventy  |  Typ: BASE  |  Wymaga: 0007
-- Plik: supabase/migrations/0015_event_text_limits.sql
-- SQL Editor: 0015 — limity tekstu eventu
-- ═══════════════════════════════════════════════════════════════════════════
-- Uruchamiaj w kolejności numerów. Skrypt idempotentny (bezpieczny ponownie).

alter table public.events
  drop constraint if exists events_title_length,
  drop constraint if exists events_notes_length;

alter table public.events
  add constraint events_title_length
    check (title is null or char_length(title) <= 60),
  add constraint events_notes_length
    check (notes is null or char_length(notes) <= 200);

notify pgrst, 'reload schema';
