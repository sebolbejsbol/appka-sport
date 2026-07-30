-- ═══════════════════════════════════════════════════════════════════════════
-- 0046 — Eventy oczekujące na ocenę boiska
-- Kategoria: Boiska  |  Typ: FEATURE  |  Wymaga: 0045
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.my_events_pending_field_rating(
  p_limit integer default 10
)
returns table (
  event_id uuid,
  field_id uuid,
  field_name text,
  title text,
  starts_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id as event_id,
    e.field_id,
    f.name as field_name,
    e.title,
    e.starts_at
  from public.events e
  left join public.fields f on f.id = e.field_id
  where public.user_can_rate_event_field(e.id)
    and not exists (
      select 1
      from public.field_ratings fr
      where fr.event_id = e.id
        and fr.user_id = auth.uid()
    )
  order by e.starts_at desc
  limit greatest(1, least(coalesce(p_limit, 10), 30));
$$;

grant execute on function public.my_events_pending_field_rating(integer) to authenticated;

notify pgrst, 'reload schema';
