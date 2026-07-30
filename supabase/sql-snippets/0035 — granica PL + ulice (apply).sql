-- ═══════════════════════════════════════════════════════════════════════════
-- 0035 — Granica PL + ulice (apply)
-- Kategoria: Boiska  |  Typ: DATA  |  Wymaga: 0002, 0005
-- SQL Editor: 0035 — granica PL + ulice (apply)
-- ═══════════════════════════════════════════════════════════════════════════
-- Wymaga wcześniej wypełnionej tabeli public.field_geocode (reverse-geocoding
-- Mapbox: kraj + ulica + miasto dla każdego boiska). Tę tabelę wypełnia skrypt
-- scripts/geocode-fields.mjs. Skrypt idempotentny (bezpieczny ponownie).
--
-- Krok 2: usuwa boiska poza granicą Polski (country <> 'PL'), z backupem.
-- Krok 3: ustawia nazwy "… · ul. <ulica> <nr>, <miasto>" dla boisk w PL.

begin;

-- ── KROK 2: backup + usunięcie boisk poza Polską ───────────────────────────
drop table if exists public.fields_removed_backup;
create table public.fields_removed_backup as
select f.*, g.country as geocoded_country, g.full_address as geocoded_address
from public.fields f
join public.field_geocode g on g.field_id = f.id
where g.country is distinct from 'PL';

-- usunięcie (events / field_ratings / field_geocode kasują się kaskadowo)
delete from public.fields f
using public.field_geocode g
where g.field_id = f.id
  and g.country is distinct from 'PL';

-- ── KROK 3: nazwy ulic dla boisk w Polsce ──────────────────────────────────
-- Bazę nazwy (część przed " · ") zachowujemy, jeśli to prawdziwa nazwa obiektu
-- (np. "Decathlon", "V Liceum…"); w przeciwnym razie "Boisko do koszykówki".
-- Dzięki split_part skrypt jest idempotentny (ponowne uruchomienie nie dubluje).
update public.fields f
set
  name =
    (
      case
        when f.name is null or btrim(f.name) = '' then 'Boisko do koszykówki'
        when position(' · ' in f.name) > 0 then split_part(f.name, ' · ', 1)
        else f.name
      end
    )
    ||
    (
      case
        when g.street is not null and btrim(coalesce(g.housenumber, '')) <> ''
          then ' · ul. ' || g.street || ' ' || g.housenumber
        when g.street is not null
          then ' · ul. ' || g.street
        else ''
      end
    )
    ||
    (
      case
        when g.place is not null and g.street is not null then ', ' || g.place
        when g.place is not null then ' · ' || g.place
        else ''
      end
    ),
  updated_at = now()
from public.field_geocode g
where g.field_id = f.id
  and g.country = 'PL';

commit;

-- ── Podsumowanie ───────────────────────────────────────────────────────────
select
  (select count(*) from public.fields) as fields_after,
  (select count(*) from public.fields_removed_backup) as removed_non_pl;

-- ── Sprzątanie pomocniczych obiektów (opcjonalne) ──────────────────────────
-- Zostawiamy field_geocode i fields_removed_backup do weryfikacji.
-- Po sprawdzeniu można usunąć ręcznie:
--   drop view if exists public.v_fields_coords;
--   drop table if exists public.pl_boundary;
--   drop table if exists public.field_geocode;
--   drop table if exists public.fields_removed_backup;
