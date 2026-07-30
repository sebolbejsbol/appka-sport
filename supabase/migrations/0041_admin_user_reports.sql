-- ═══════════════════════════════════════════════════════════════════════════
-- 0041 — Panel admina: zgłoszenia użytkowników
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.admin_user_reports_queue(
  p_status text default 'pending',
  p_max_rows integer default 50
)
returns table (
  id uuid,
  reporter_id uuid,
  reporter_nick text,
  reported_user_id uuid,
  reported_nick text,
  reason text,
  details text,
  status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_app_admin() then
    raise exception 'not_admin';
  end if;

  return query
  select
    ur.id,
    ur.reporter_id,
    rp.nick as reporter_nick,
    ur.reported_user_id,
    up.nick as reported_nick,
    ur.reason,
    ur.details,
    ur.status,
    ur.created_at
  from public.user_reports ur
  left join public.profiles rp on rp.id = ur.reporter_id
  left join public.profiles up on up.id = ur.reported_user_id
  where ur.status = coalesce(nullif(p_status, ''), 'pending')
  order by ur.created_at desc
  limit least(greatest(coalesce(p_max_rows, 50), 1), 100);
end;
$$;

grant execute on function public.admin_user_reports_queue(text, integer) to authenticated;

create or replace function public.admin_update_user_report(
  p_report_id uuid,
  p_status text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current text;
begin
  if auth.uid() is null then
    return 'not_authenticated';
  end if;

  if not public.is_app_admin() then
    return 'not_admin';
  end if;

  if p_status not in ('reviewed', 'dismissed') then
    return 'invalid_status';
  end if;

  select ur.status into v_current
  from public.user_reports ur
  where ur.id = p_report_id;

  if not found then
    return 'not_found';
  end if;

  if v_current <> 'pending' then
    return 'already_closed';
  end if;

  update public.user_reports
  set status = p_status
  where id = p_report_id;

  return 'ok';
end;
$$;

grant execute on function public.admin_update_user_report(uuid, text) to authenticated;

notify pgrst, 'reload schema';
