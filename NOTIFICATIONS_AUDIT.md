# Audyt systemu powiadomień — ETAP 1

Data: 2026-08-14. Zakres: cały projekt (Supabase/Postgres backend, klient
Expo/React Native + web).

## 0. Czy mechanizm już istnieje? — TAK, i jest szeroko rozbudowany

To nie jest budowa od zera. Istnieje kompletny, działający rdzeń:

- **Tabela `public.notifications`** (`user_id, type, title, body, data jsonb,
  read_at, created_at`), RLS: użytkownik czyta/oznacza tylko swoje wiersze,
  insert wyłącznie przez triggery/funkcje `security definer` — patrz
  `supabase/migrations/0077_favorites_and_notifications.sql`.
- **Centralny punkt wysyłki `public.notify_user(p_user_id, p_type, p_title,
  p_body, p_data)`** — dokładnie to, o co prosi punkt 4 (ETAP 2): jedno
  wywołanie = insert do `notifications` + push przez Expo Push API. Zamiast
  klasy w aplikacji, to funkcja Postgresa wołana z triggerów/RPC — logika
  biznesowa w tej appce już mieszka głównie w bazie (patrz istniejące
  triggery `validate_event_before_insert`, `enforce_event_daily_limit`),
  więc to jest spójne z architekturą, nie obejście jej.
  Definicja: `supabase/migrations/0091_notifications_full_coverage.sql`.
- **18 miejsc już podpiętych pod `notify_user`** (lista w sekcji 1 niżej).
- **Cron przypomnień** `public.process_event_push_reminders()` — dwa stałe
  okna: ~20 min przed startem („meldowanie otwarte") i ~5 min przed
  startem („event za chwilę"). To ISTNIEJE, ale to inne okna niż 24h/1h/15min
  wspomniane w zleceniu — patrz pytanie w sekcji 4.
- **Klient**: `src/lib/notifications.ts` (lista, licznik nieprzeczytanych,
  oznaczanie przeczytane, subskrypcja realtime), `src/lib/push-notifications.ts`
  + `src/hooks/use-push-notifications.ts` (rejestracja tokenu, tap-to-navigate),
  dzwonek `NotificationsBell` w `src/components/app-side-menu.tsx`, przełącznik
  „Powiadomienia" w `src/app/(app)/settings.tsx` (`Switch`, punkt 10 z ETAP 3
  — **już istnieje**, ale tylko na natywnych platformach, patrz sekcja 3).

**Wniosek: nie duplikuję. Etapy 2-3 poniżej to rozbudowa istniejącego rdzenia,
nie nowa architektura.**

## 1. Zdarzenia JUŻ pokryte (18) — dla kompletności referencyjnej

| Trigger | Odbiorca | Natychmiastowe/zaplanowane | Gdzie w kodzie |
|---|---|---|---|
| Dołączenie do eventu | organizator | natychmiastowe | `notify_organizer_on_event_join()` |
| Okno meldowania (~20 min przed startem) | uczestnicy | zaplanowane (cron) | `process_event_push_reminders()` |
| Event za chwilę (~5 min przed startem) | uczestnicy | zaplanowane (cron) | `process_event_push_reminders()` |
| Zaproszenie do drużyny | zapraszany | natychmiastowe | `invite_to_team()` |
| Zaproszenie drużyny na mecz | każdy członek drużyny | natychmiastowe | `invite_team_to_event()` |
| Wiadomość 1:1 | odbiorca | natychmiastowe | `notify_on_new_message()` |
| Wiadomość grupowa | członkowie grupy (bez wyciszonych) | natychmiastowe | `notify_on_new_message()` |
| Wiadomość w czacie drużyny | członkowie (bez wyciszonych) | natychmiastowe | `notify_on_new_message()` |
| Polubienie posta | autor posta | natychmiastowe | `toggle_post_like()` |
| Komentarz pod postem | autor posta | natychmiastowe | `create_post_comment()` |
| Odpowiedź na komentarz | autor komentarza-rodzica | natychmiastowe | `create_post_comment()` |
| Oznaczenie (@nick) w poście | oznaczony | natychmiastowe | `sync_post_mentions()` |
| Zaproszenie 1:1 na event ("Szukaj teraz") | zapraszany | natychmiastowe | `invite_user_to_event()` |
| Zwolnione miejsce (lista rezerwowa) | awansowany uczestnik | natychmiastowe | `promote_event_waitlist()` |
| Zaproszenie do znajomych | zapraszany | natychmiastowe | `send_friend_request()` |
| Zaakceptowanie zaproszenia do znajomych | wysyłający zaproszenie | natychmiastowe | `respond_friend_request()` |
| Prośba o dołączenie do drużyny | managerowie drużyny | natychmiastowe | `request_join_team()` |
| Odpowiedź na prośbę o dołączenie | proszący | natychmiastowe | `respond_team_join_request()` |
| Usunięcie z drużyny | usunięty | natychmiastowe | `remove_team_member()` |
| Usunięcie z eventu | usunięty | natychmiastowe | `remove_event_participant()` |

## 2. Realne dostarczanie na telefon — stan obecny

To NIE jest ani czysty Web Push (VAPID), ani gołe FCM/APNs — to
**Expo Push Notifications**, warstwa pośrednia Expo, która pod spodem
korzysta z FCM (Android) i APNs (iOS) za jednym wspólnym API
(`send_expo_push` → `https://exp.host/--/api/v2/push/send`).

- **Android**: skonfigurowane — `app.json` ma `googleServicesFile:
  "./google-services.json"` (już w repo).
- **iOS**: nie da się potwierdzić z samego kodu — certyfikat/klucz APNs
  (jeśli skonfigurowany) żyje w zdalnym magazynie danych uwierzytelniających
  EAS, nie w repo. **Do sprawdzenia/potwierdzenia przez Ciebie w
  `eas credentials`.**
- **Web: brak jakiegokolwiek push.** Zero VAPID/Service Worker/Push API w
  repo. Przełącznik „Powiadomienia" w Ustawieniach jest **celowo ukryty na
  webie** (`settings.tsx`, komunikat „niedostępne na wersji webowej").
  Użytkownicy na stronie widzą powiadomienia WYŁĄCZNIE w dzwonku w apce
  (realtime, ale tylko gdy mają otwartą kartę) — nigdy jako prawdziwy push
  przeglądarki/systemu.
  **To duży, osobny projekt infrastruktury (VAPID keys, Service Worker,
  przechowywanie subskrypcji per przeglądarka) — patrz pytanie w sekcji 4.**

## 3. Potwierdzone luki (do zaadresowania w ETAP 2)

1. **Zmiana szczegółów eventu (data/godzina/miejsce) i odwołanie eventu —
   brak jakiejkolwiek notyfikacji.** `updateEvent()`/`deleteEvent()`
   (`src/lib/events.ts:598-632`) to gołe `update`/`delete` na tabeli, bez
   RPC i bez triggera AFTER UPDATE/DELETE. Uczestnik eventu dziś NIE
   dowiaduje się, że organizator przesunął godzinę albo odwołał mecz.
   **To realna luka bezpieczeństwa danych/UX, priorytet wysoki.**
2. **Reakcje na wiadomości nie powiadamiają autora.** `toggle_reaction`
   (`supabase/migrations/0054_messaging_v2.sql:699-739`) tylko
   wstawia/usuwa wiersz w `message_reactions`, żadnego `notify_user`.
3. **Brak czyszczenia martwych tokenów push.** `send_expo_push()` woła
   Expo Push API i nigdy nie sprawdza odpowiedzi (tickets/receipts) —
   token urządzenia, na którym apka została odinstalowana, zostaje
   w bazie w nieskończoność i próby wysyłki tam po prostu cicho giną.
   Zero obsługi błędu `DeviceNotRegistered`.
4. **Jeden token na użytkownika, nie na urządzenie.**
   `profiles.expo_push_token` to pojedyncza kolumna — drugi telefon (albo
   reinstall) po prostu nadpisuje token pierwszego, który przestaje
   dostawać push bez żadnego sygnału. Brak tabeli wielourządzeniowej.
5. **Web push nie istnieje** — patrz sekcja 2, największa pojedyncza luka
   dostarczania (nie logiki biznesowej).
6. **Brak skryptu testowego** wysyłającego przykładowe powiadomienie
   każdego typu do weryfikacji ręcznej.

## 4. Decyzje do potwierdzenia przed ETAP 2-4

Nie da się ich jednoznacznie wywnioskować z kodu — patrz osobne pytanie,
które zaraz zadam w czacie:

- **Okna przypomnień**: zlecenie wymienia 24h/1h/15min przed eventem;
  istniejący cron ma 20min (meldowanie)/5min (start). Zastąpić istniejące
  okna nowymi, czy dodać obok (więcej = więcej powiadomień = ryzyko
  zmęczenia użytkownika)?
- **Web Push (VAPID)** to osobny, spory kawałek infrastruktury (klucze,
  Service Worker, magazyn subskrypcji, zgoda przeglądarki) — biorąc pod
  uwagę, że testujesz apkę głównie przez stronę webową, to prawdopodobnie
  najbardziej wartościowa pojedyncza luka do zamknięcia, ale i
  największa — wolę potwierdzić priorytet, zanim zacznę.
- **Wielourządzeniowe tokeny push** — realna zmiana schematu (nowa
  tabela, migracja istniejących tokenów, przepisanie `send_expo_push` na
  pętlę po urządzeniach). Wart tego zakresu teraz, czy zostawić jeden
  token na użytkownika na razie?
