-- ═══════════════════════════════════════════════════════════════════════════
-- 0098 — Ocenę boiska można wystawić tylko po faktycznym zameldowaniu
-- Kategoria: Boiska  |  Typ: FIX  |  Wymaga: 0045, 0010
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Wcześniej user_can_rate_event_field wymagał tylko zapisu na event
-- (event_participants) + zakończenia eventu — dało się ocenić boisko bez
-- fizycznego pojawienia się na nim. Teraz wymagamy też wiersza w
-- event_check_ins (zameldowanie GPS lub ręczne przez organizatora).

create or replace function public.user_can_rate_event_field(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.events e
    inner join public.event_participants ep
      on ep.event_id = e.id and ep.user_id = auth.uid()
    inner join public.event_check_ins ci
      on ci.event_id = e.id and ci.user_id = auth.uid()
    where e.id = p_event_id
      and e.status <> 'cancelled'
      and (
        e.status = 'finished'
        or now() > e.starts_at + (e.duration_min || ' minutes')::interval
      )
  );
$$;

grant execute on function public.user_can_rate_event_field(uuid) to authenticated;

notify pgrst, 'reload schema';
