-- ═══════════════════════════════════════════════════════════════════════════
-- 0013 — Admin: weryfikacja boisk
-- Kategoria: Admin  |  Typ: BASE  |  Wymaga: 0002
-- Plik: supabase/migrations/0013_admin_fields.sql
-- SQL Editor: 0013 — admin · boiska
-- ═══════════════════════════════════════════════════════════════════════════
-- Uruchamiaj w kolejności numerów. Skrypt idempotentny (bezpieczny ponownie).

drop policy if exists "Approved fields are viewable by authenticated users" on public.fields;
create policy "Fields viewable by users and admins"
  on public.fields for select
  to authenticated
  using (status = 'approved' or public.is_app_admin());

-- 2) RLS: admin może zmieniać status (moderacja)
drop policy if exists "Admins can moderate fields" on public.fields;
create policy "Admins can moderate fields"
  on public.fields for update
  to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

-- 3) Kolejka boisk do weryfikacji (tylko admin)
create or replace function public.admin_fields_queue(
  p_status text default 'pending',
  p_max_rows integer default 50
)
returns table (
  id uuid,
  name text,
  sport text,
  status text,
  source text,
  lng double precision,
  lat double precision,
  created_at timestamptz
)
language plpgsql
stable
as $$
begin
  if not public.is_app_admin() then
    raise exception 'not_admin';
  end if;

  return query
  select
    f.id,
    f.name,
    f.sport,
    f.status,
    f.source,
    st_x(f.geom::geometry) as lng,
    st_y(f.geom::geometry) as lat,
    f.created_at
  from public.fields f
  where f.status = coalesce(nullif(p_status, ''), 'pending')
  order by f.created_at asc
  limit least(greatest(coalesce(p_max_rows, 50), 1), 100);
end;
$$;

grant execute on function public.admin_fields_queue(text, integer) to authenticated;

-- 4) Zmiana statusu boiska (tylko admin, tylko z pending)
create or replace function public.moderate_field(
  p_field_id uuid,
  p_status text
)
returns void
language plpgsql
as $$
begin
  if not public.is_app_admin() then
    raise exception 'not_admin';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'invalid_status';
  end if;

  update public.fields
  set status = p_status
  where id = p_field_id
    and status = 'pending';

  if not found then
    raise exception 'field_not_found_or_not_pending';
  end if;
end;
$$;

grant execute on function public.moderate_field(uuid, text) to authenticated;

notify pgrst, 'reload schema';
