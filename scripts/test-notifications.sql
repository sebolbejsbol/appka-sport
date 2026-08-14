-- ETAP 4: ręczny test dostarczania powiadomień na żywo.
--
-- Jak użyć:
--   1. Podmień '<TWOJE_USER_ID>' poniżej na swoje prawdziwe id z auth.users
--      (Supabase Dashboard -> Authentication -> Users, albo:
--       select id from auth.users where email = 'twoj@email.pl';).
--   2. Upewnij się, że masz aktywny token push zarejestrowany:
--      - telefon: otwórz apkę, włącz powiadomienia w Ustawieniach.
--      - przeglądarka: otwórz apkę na stronie, włącz powiadomienia w
--        Ustawieniach (wymaga zaaplikowanej migracji 0094 + wdrożonej
--        Edge Function send-web-push + ustawionego
--        app.settings.notify_shared_secret, patrz
--        supabase/functions/send-web-push/README.md).
--   3. Uruchom: node scripts/run-supabase-sql.mjs scripts/test-notifications.sql
--   4. Powinieneś dostać serię powiadomień w kilkusekundowych odstępach —
--      w dzwoneczku w apce ZAWSZE (to zapis do bazy, działa niezależnie od
--      push), i jako prawdziwy push na telefonie/w przeglądarce, jeśli masz
--      tam zarejestrowane urządzenie.

do $$
declare
  v_user_id uuid := '<TWOJE_USER_ID>';
begin
  if v_user_id is null then
    raise exception 'Podmień <TWOJE_USER_ID> na prawdziwe id przed uruchomieniem.';
  end if;

  perform public.notify_user(v_user_id, 'test_event_join', 'Test: dołączenie do eventu',
    'Ktoś dołączył do Twojego meczu (test).', jsonb_build_object('type', 'test'));
  perform pg_sleep(1);

  perform public.notify_user(v_user_id, 'test_checkin_open', 'Test: meldowanie otwarte',
    'Możesz się zameldować na boisku (test).', jsonb_build_object('type', 'test'));
  perform pg_sleep(1);

  perform public.notify_user(v_user_id, 'test_event_updated', 'Test: zmiana w evencie',
    'Organizator zmienił termin lub miejsce (test).', jsonb_build_object('type', 'test'));
  perform pg_sleep(1);

  perform public.notify_user(v_user_id, 'test_event_cancelled', 'Test: event odwołany',
    'Wydarzenie zostało odwołane (test).', jsonb_build_object('type', 'test'));
  perform pg_sleep(1);

  perform public.notify_user(v_user_id, 'test_message_reaction', 'Test: nowa reakcja',
    'Ktoś zareagował na Twoją wiadomość (test).', jsonb_build_object('type', 'test'));
  perform pg_sleep(1);

  perform public.notify_user(v_user_id, 'test_reminder_24h', 'Test: jutro grasz',
    'Twój event odbędzie się jutro o tej porze (test).', jsonb_build_object('type', 'test'));
  perform pg_sleep(1);

  perform public.notify_user(v_user_id, 'test_reminder_1h', 'Test: za godzinę grasz',
    'Twój event zaczyna się za godzinę (test).', jsonb_build_object('type', 'test'));

  raise notice 'Wysłano 7 testowych powiadomień do %', v_user_id;
end;
$$;

-- Ile z powyższych faktycznie ma zarejestrowane urządzenie (0 wierszy =
-- powiadomienia zapisały się w dzwoneczku, ale push nigdzie nie poleciał):
select platform, count(*) from public.push_tokens where user_id = '<TWOJE_USER_ID>' group by platform;
