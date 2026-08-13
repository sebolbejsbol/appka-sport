-- Migracja 0088: podgląd statusu zaproszeń do drużyny (kto zaakceptował,
-- kto oczekuje, kto odrzucił) — używane na ekranie rejestracji drużyny do
-- turnieju, żeby pokazać postęp kompletowania składu bez osobnego kreatora.
-- Wymaga: 0032 (team_invitations, is_team_member).

create or replace function public.list_team_invitations_for_team(p_team_id uuid)
returns table (
  invitation_id uuid,
  user_id uuid,
  nick text,
  avatar_url text,
  status text,
  created_at timestamptz,
  responded_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ti.id as invitation_id,
    ti.to_user_id as user_id,
    p.nick,
    p.avatar_url,
    ti.status,
    ti.created_at,
    ti.responded_at
  from public.team_invitations ti
  join public.profiles p on p.id = ti.to_user_id
  where ti.team_id = p_team_id
    and public.is_team_member(p_team_id, auth.uid())
  order by
    case ti.status when 'pending' then 0 when 'accepted' then 1 else 2 end,
    ti.created_at desc;
$$;

grant execute on function public.list_team_invitations_for_team(uuid) to authenticated;
