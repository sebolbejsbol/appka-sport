-- ═══════════════════════════════════════════════════════════════════════════
-- 0040 — Usuwanie konta użytkownika
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.delete_my_account()
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return 'not_authenticated';
  end if;

  -- teams.owner_id ma ON DELETE RESTRICT — najpierw usuwamy własne drużyny
  delete from public.teams where owner_id = v_uid;

  delete from auth.users where id = v_uid;

  if not found then
    return 'user_not_found';
  end if;

  return 'deleted';
exception
  when others then
    return 'error';
end;
$$;

grant execute on function public.delete_my_account() to authenticated;

notify pgrst, 'reload schema';
