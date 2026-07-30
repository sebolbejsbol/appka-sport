-- 0058: Preferowany język w profilu + walidacja wydarzeń po stronie bazy.

-- 1) Język interfejsu zapisywany w profilu (wybierany przy rejestracji).
alter table public.profiles
  add column if not exists language text not null default 'pl';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_language_check'
  ) then
    alter table public.profiles
      add constraint profiles_language_check check (language in ('pl', 'en'));
  end if;
end $$;

-- 2) Obowiązkowe pola wydarzenia (kategoria, podkategoria, lokalizacja, tytuł).
--    Walidacja działa tylko dla nowych wstawień (nie rusza istniejących wierszy)
--    i pomija aktywności "Szukam teraz" (is_instant = true), które są uproszczone.
create or replace function public.validate_event_before_insert()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.is_instant, false) = false then
    if new.category is null or char_length(btrim(new.category)) = 0 then
      raise exception 'EVENT_CATEGORY_REQUIRED';
    end if;

    -- Podkategoria wymagana dla wszystkich kategorii poza "inne"
    -- (tylko "inne" nie ma listy podkategorii).
    if new.category <> 'inne'
       and (new.subcategory is null or char_length(btrim(new.subcategory)) = 0) then
      raise exception 'EVENT_SUBCATEGORY_REQUIRED';
    end if;

    if new.title is null or char_length(btrim(new.title)) < 3 then
      raise exception 'EVENT_TITLE_REQUIRED';
    end if;

    if new.lat is null or new.lng is null then
      raise exception 'EVENT_LOCATION_REQUIRED';
    end if;

    if new.starts_at is null then
      raise exception 'EVENT_START_REQUIRED';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_event_before_insert on public.events;
create trigger trg_validate_event_before_insert
  before insert on public.events
  for each row
  execute function public.validate_event_before_insert();

-- 3) RPC do zmiany własnego języka (z poziomu rejestracji/ustawień).
create or replace function public.set_own_language(p_language text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_language is null or p_language not in ('pl', 'en') then
    raise exception 'invalid_language';
  end if;
  update public.profiles set language = p_language where id = auth.uid();
end;
$$;

grant execute on function public.set_own_language(text) to authenticated;
