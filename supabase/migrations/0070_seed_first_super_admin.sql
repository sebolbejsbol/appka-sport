-- Migracja 0070: nadanie pierwszej roli super_admin
-- Uruchom RAZ, jako postgres, w Supabase SQL Editor — wykonywana z panelu
-- dashboardu current_user = 'postgres', więc trigger profiles_protect_admin
-- (migracja 0069) przepuszcza tę zmianę.
-- Wymaga, żeby konto tymanskifilip@gmail.com już istniało (zarejestrowane w appce).

do $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where email = 'tymanskifilip@gmail.com';

  if v_id is null then
    raise exception
      'Nie znaleziono konta tymanskifilip@gmail.com — załóż konto w aplikacji, potem uruchom tę migrację ponownie.';
  end if;

  update public.profiles
  set role = 'super_admin', is_admin = true
  where id = v_id;
end;
$$;
