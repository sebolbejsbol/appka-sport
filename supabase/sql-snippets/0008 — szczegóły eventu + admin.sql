-- ═══════════════════════════════════════════════════════════════════════════
-- 0008 — Szczegóły eventu + admin
-- Kategoria: Eventy  |  Typ: BASE  |  Wymaga: 0007
-- Plik: supabase/migrations/0008_event_detail_admin.sql
-- SQL Editor: 0008 — szczegóły eventu + admin
-- ═══════════════════════════════════════════════════════════════════════════
-- Uruchamiaj w kolejności numerów. Skrypt idempotentny (bezpieczny ponownie).

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

comment on column public.profiles.is_admin is 'Administrator aplikacji (panel moderacji eventów itd.).';

-- Nadaj admina kontu o nicku Zevy (0 wierszy = konto jeszcze nie istnieje — uruchom ponownie po rejestracji)
update public.profiles
set is_admin = true
where lower(trim(nick)) = 'zevy';

-- 2) Helper: czy zalogowany użytkownik jest adminem
create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

grant execute on function public.is_app_admin() to authenticated;

-- 3) RLS: admin (Zevy) może edytować i usuwać dowolny event
drop policy if exists "Creators can update their events" on public.events;
create policy "Creators and admins can update events"
  on public.events for update
  to authenticated
  using (auth.uid() = creator_id or public.is_app_admin())
  with check (auth.uid() = creator_id or public.is_app_admin());

drop policy if exists "Creators can delete their events" on public.events;
create policy "Creators and admins can delete events"
  on public.events for delete
  to authenticated
  using (auth.uid() = creator_id or public.is_app_admin());

-- 4) RPC: pełne szczegóły eventu + lista graczy
create or replace function public.event_detail(p_event_id uuid)
returns json
language sql
stable
as $$
  select json_build_object(
    'id', e.id,
    'field_id', e.field_id,
    'field_name', f.name,
    'title', e.title,
    'notes', e.notes,
    'starts_at', e.starts_at,
    'duration_min', e.duration_min,
    'max_players', e.max_players,
    'status', e.status,
    'sport', e.sport,
    'creator_id', e.creator_id,
    'creator_nick', cp.nick,
    'participant_count', (
      select count(*) from public.event_participants ep where ep.event_id = e.id
    ),
    'is_joined', exists(
      select 1 from public.event_participants ep2
      where ep2.event_id = e.id and ep2.user_id = auth.uid()
    ),
    'can_manage', (e.creator_id = auth.uid() or public.is_app_admin()),
    'is_admin_view', public.is_app_admin(),
    'participants', coalesce((
      select json_agg(
        json_build_object(
          'user_id', ep.user_id,
          'nick', pp.nick,
          'joined_at', ep.joined_at
        )
        order by ep.joined_at asc
      )
      from public.event_participants ep
      left join public.profiles pp on pp.id = ep.user_id
      where ep.event_id = e.id
    ), '[]'::json)
  )
  from public.events e
  left join public.fields f on f.id = e.field_id
  left join public.profiles cp on cp.id = e.creator_id
  where e.id = p_event_id;
$$;

grant execute on function public.event_detail(uuid) to authenticated;

notify pgrst, 'reload schema';
