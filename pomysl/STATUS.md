# Status techniczny — Appka Sport

> Plik operacyjny: gdzie konkretnie jesteśmy w kodzie, co działa, co dalej.
> Aktualizować po każdej istotnej zmianie.

---

## Data ostatniej aktualizacji

**25 czerwca 2026** (noc — sesja DUDIE DAY: UX, mapa, naprawa regulaminu)

> ⭐ **TO JEST NASZA GŁÓWNA APLIKACJA.** Zostaje u nas na stałe — kolejne sesje to
> poprawki i aktualizacje na tym fundamencie. Stan zapisany w gicie (commit z 25.06.2026).

---

## Sesja 24–25.06.2026 — DUDIE DAY (rebranding + UX + krytyczna naprawa)

### 🔴 Krytyczna naprawa: regulamin/polityka po starcie (ROZWIĄZANE)
- **Problem:** po zalogowaniu aplikacja otwierała się od razu na regulaminie/polityce,
  a przycisk „wstecz" nie działał. Przyczyna: ekran prawny był **trasą** nawigacji,
  którą expo-router / klient deweloperski **odtwarzał** jako ekran startowy (pętla,
  której nie dało się przebić przez `replace` / `Redirect`).
- **Rozwiązanie:** regulamin i polityka są teraz **pełnoekranowym modalem (overlay)**,
  a NIE trasą. Odtworzona trasa `/legal/*` nie istnieje → apka wraca na mapę.
  „Wstecz" zawsze zamyka modal. Działa też w produkcji.
- **Pliki:** `src/lib/legal-navigation.ts` (emitter zamiast `router.push`),
  `src/components/legal-document-host.tsx` (nowy host z `Modal`),
  `src/components/legal-document.tsx` (`LegalDocumentView` + `onClose`),
  `src/app/_layout.tsx` (montaż hosta, usunięty `<Stack.Screen name="legal">`).
  Usunięte: `src/app/legal/{terms,privacy,_layout}.tsx`, `src/app/+native-intent.ts`.

### Reszta zmian z sesji
- **Rebranding DUDIE DAY:** nowe logo (przezroczyste na ekranie logowania, białe tło +
  niebieski spinner na ekranie ładowania), logo usunięte z menu, usunięty napis
  „sport amatorski", płynne przejście ze splasha.
- **Tworzenie eventu:** krok 3 = nasza główna mapa z punktami zależnymi od kategorii +
  opcja własnego punktu (jawna aktywacja, bez celownika po powiększeniu); kroki 4+5
  połączone, mniej ważne pola pod „więcej szczegółów"; pole „poziom zaawansowania"
  zgodne z filtrami; emoji boisk wielofunkcyjnych = 🥅.
- **Mapa:** kropki jako emoji zależne od kategorii, płynność (ładowanie na `onMapIdle`),
  usunięte halo/celownik (🎯), usunięty znak wodny/logo Mapbox.
- **Filtry mapy:** poziom zaawansowania / płatność / odległość pod „więcej opcji",
  usunięty „typ wydarzenia".
- **Profil:** bio, statystyki, naprawione ładowanie. **Zespoły** (zmiana nazwy z „Teams")
  + lepsze tworzenie. **Grupowe wiadomości usunięte.** i18n lewego menu.
- **Logowanie/rejestracja:** potwierdzenie hasła + naprawa błędu rejestracji.
- **16+:** jednorazowy, ostylowany modal-przypomnienie po pierwszym logowaniu
  (`src/components/disclaimer-prompt-host.tsx`).

---

## Środowisko Sebastiana

- **System:** Windows
- **Lokalizacja projektu:** `D:\appka-sport`
- **Edytor:** Cursor (zainstalowany, projekt otwarty)
- **Node.js:** v24.16.0
- **Konto Cursor:** Sebastian Choromański (Free Plan)

### Ważny workaround (Windows + AV/firewall)

Sebastian ma jakieś oprogramowanie (antywirus / firewall), które przechwytuje certyfikaty SSL i blokuje pobieranie paczek przez `npx` i `npm install`. Rozwiązanie: przed każdą instalacją z internetu uruchomić w terminalu:

```powershell
$env:NODE_OPTIONS="--use-system-ca"
```

To każe Node.js używać certyfikatów Windowsa zamiast własnych. Po restarcie terminala trzeba uruchomić ponownie.

### Inne zasady techniczne

- **Ścieżki:** tylko angielskie znaki, bez spacji i polskich liter (`D:\appka-sport` — OK)
- **Dokumentacja Expo:** przed kodem sprawdzać https://docs.expo.dev/versions/v56.0.0/

---

## Menu główne (hamburger)

| Pozycja | Ścieżka | Zawartość |
|---------|---------|-----------|
| Mapa | `/` | Boiska, eventy, GPS |
| Eventy | `/events` | Lista z filtrami |
| Aktualności | `/feed` | Posty od obserwowanych |
| Drużyny | `/teams` | Drużyny sportowe + czaty |
| Znajomi | `/social` | Wyszukiwarka + lista znajomych |
| Wiadomości | `/messages` | Inbox DM (styl IG) |
| Mój profil | `/profile` | Profil publiczny (własny) |
| Administracja | `/admin` | Tylko `is_admin` |
| Ustawienia | `/settings` | Powiadomienia, zgłaszanie boisk |

Pod-ekrany bez hamburgera (własny ←): `/social/search`, `/social/friends`, `/profile/edit`, `/teams/*`, `/user/[id]`, `/messages/[id]`, `/admin/*`, `/event/*`.

---

## Model społecznościowy (3 kręgi)

| Warstwa | Mechanizm | Po co |
|---------|-----------|-------|
| **Obserwuję / Obserwują** | Jednostronne `follows` | Feed aktualności — posty od obserwowanych |
| **Znajomi** | Zaproszenie + akceptacja (`friendships`) | Zaufany krąg, łatwe DM |
| **Wiadomości** | Osobny inbox | DM do: znajomego · po wspólnym meczu · gdy jest już czat |

Obserwowanie **nie** otwiera DM — to celowo.

---

## Drużyny sportowe (nowe — 17.06.2026)

### Funkcje
- Tworzenie drużyny: nazwa, opis, sport, logo (galeria — wymaga nowego buildu)
- Role: **Właściciel** · **Administrator** · **Członek**
- Zapraszanie zawodników, usuwanie, mianowanie adminów, przekazanie własności
- **Czat drużyny** — osobna rozmowa grupowa na drużynę
- Udostępnianie eventu na czacie drużyny
- Organizator eventu: **zaproszenie całej drużyny** + licznik „X z Y zaakceptowało” + push do członków

### Ekrany
- `/teams` — lista drużyn + zaproszenia + badge nieprzeczytanych
- `/teams/create` — nowa drużyna (**nie** `/teams/new` — konflikt routingu naprawiony)
- `/teams/[id]` — szczegóły, skład, czat, zaproszenia
- `/teams/[id]/chat` — czat grupowy
- `/teams/[id]/invite` — szukaj i zaproś gracza
- `/teams/[id]/settings` — edycja (admin/właściciel)
- `/event/[id]/invite-team` — zaproś drużynę na mecz
- `/event/[id]/share-team` — udostępnij event na czacie drużyny

### Pliki kluczowe
- `supabase/migrations/0032_teams.sql`
- `src/lib/teams.ts`, `src/lib/sports.ts`, `src/lib/team-storage.ts`, `src/lib/pick-image.ts`
- `src/components/team-avatar.tsx`
- `src/app/(app)/teams/_layout.tsx`

### Znane ograniczenia
- **Logo z galerii:** dodano `expo-image-picker` + plugin w `app.json` — wymaga **nowego buildu EAS dev-client**. Bez buildu formularz działa, logo można pominąć.
- **Biały ekran przy +** (naprawione): był konflikt `/teams/new` → `[id]` oraz crash importu image pickera. Teraz ścieżka `/teams/create` + lazy import pickera.

---

## Feed / posty (17.06.2026)

- Zakładka **Aktualności** (`/feed`) — composer + lista postów od obserwowanych (+ własne)
- Posty na profilu użytkownika
- Migracja: `0031_posts_and_feed.sql`

---

## Wiadomości i profile (wcześniejsze sesje)

- DM 1:1 (`0027_direct_messages.sql`) — inbox IG-style, realtime, push
- Znajomi ≠ obserwowanie (`0030_friends_not_follows.sql`)
- Profil publiczny: `/user/[id]`, własny profil `/profile`, edycja `/profile/edit`
- Listy: Znajomi | Obserwują | Obserwuję | Zaproszenia (`/social/friends`)

---

## Migracje SQL — stan w bazie

| Migracja | Opis | Status |
|----------|------|--------|
| 0001–0026 | Profile, boiska, eventy, admin, social graph | ✅ Wgrane (potwierdzone wcześniej) |
| 0027 | Wiadomości prywatne DM | ⏳ Do wgrania |
| 0028 | Mutual follow = friends (nadpisane przez 0030) | ⏳ Opcjonalnie / pomijaj jeśli idziesz od razu do 0030 |
| 0029 | Wspólne eventy + `can_message_user` | ⏳ Do wgrania |
| 0030 | Znajomi ≠ follow, przywrócone zaproszenia | ⏳ Do wgrania |
| 0031 | Posty + feed aktualności | ⏳ Do wgrania |
| 0032 | Drużyny, czat drużyny, zaproszenia na eventy, storage logo | ⏳ Do wgrania |

**Kolejność wgrywania (SQL Editor):** `0027` → `0029` → `0030` → `0031` → `0032`  
(0028 można pominąć — 0030 zastępuje logikę znajomych)

Po każdej migracji na końcu pliku jest `notify pgrst, 'reload schema';`.

---

## Co już jest zrobione (skrót historyczny)

1. ✅ Expo SDK 56, Supabase Auth, profile, Mapbox, GPS
2. ✅ Boiska OSM Trójmiasto (~1375), filtry koszykówki
3. ✅ Eventy: tworzenie, lista, meldowanie GPS, lifecycle, filtry zaawansowane
4. ✅ Panel admina boisk, push notifications (Expo), zgłaszanie boisk
5. ✅ Dev client Android + **live reload USB** (`adb reverse` + Metro) — działa
6. ✅ **Społeczność:** znajomi, obserwowanie, profile publiczne, DM
7. ✅ **Feed:** posty od obserwowanych
8. ✅ **Drużyny:** pełny moduł w kodzie + migracja 0032

Szczegóły starszych punktów (1–35) — w historii gita / wcześniejszych wersjach tego pliku.

---

## Struktura projektu (aktualna, skrót)

```
D:\appka-sport\
├── src\app\(app)\
│   ├── index.tsx              (mapa)
│   ├── events\                (lista eventów)
│   ├── feed\                  (aktualności)
│   ├── teams\                 (drużyny + create + [id]/*)
│   ├── social\                (znajomi, search, friends)
│   ├── messages\              (inbox + czat DM)
│   ├── profile\               (profil + edit)
│   ├── user\[id]\             (profil innego gracza)
│   ├── event\                 (new, edit, [id], invite-team, share-team)
│   ├── admin\                 (panel admina)
│   └── settings\
├── src\lib\                   (supabase, events, social, messages, posts, teams…)
├── src\components\            (map-view, post-card, team-avatar, public-profile-view…)
├── supabase\migrations\       (0001–0032)
└── pomysl\                    (PLAN.md, SLOWNIK.md, STATUS.md)
```

---

## Co dalej — następna sesja

1. ⏳ **Wgrać migracje 0027 → 0032** w Supabase (kolejność jak wyżej)
2. ⏳ **Przetestować na telefonie:** feed, drużyny (utwórz, czat, zaproszenie na event)
3. ⏳ **Nowy build EAS dev-client** — po dodaniu `expo-image-picker` (logo drużyny)
4. Opcjonalnie: polubienia/komentarze pod postami, mecze drużyna vs drużyna

---

## Procedura wznowienia pracy (telefon)

1. Podłącz USB, odblokuj telefon
2. `$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")`
3. `adb devices` → `device`
4. `adb reverse tcp:8081 tcp:8081`
5. `$env:NODE_OPTIONS="--use-system-ca"; npx expo start --dev-client --port 8081`
6. Otwórz apkę dev na telefonie

**Typowe błędy:** `Unable to load script` → brak `adb reverse`; `Unmatched Route` → zła ścieżka expo-router.

---

## Jak wrócić do pracy w nowym czacie (Cursor)

1. Otwórz folder `D:\appka-sport` w Cursorze
2. Załącz / wskaż: `pomysl/STATUS.md`, `pomysl/PLAN.md`, `pomysl/SLOWNIK.md`
3. Pierwsza wiadomość: „Wracamy do appki sport — przeczytaj STATUS.md i kontynuuj”
4. Wgraj brakujące migracje SQL jeśli jeszcze nie wgrane

---

## Konta i klucze

- [x] Supabase: `gjkbnkaijlempveotnui` (Frankfurt)
- [x] Klucze w `.env` (gitignore)
- [x] Mapbox token w `.env`
- [x] Expo/EAS: `sebolbejsbol`, projectId w `app.json`
- [ ] GitHub repo: opcjonalnie

> **UWAGA:** nigdy nie commituj `.env` ani sekretów.

---

## Aktualnie otwarte / do pilnowania

- Migracje **0027–0032** muszą być w bazie, inaczej social/feed/drużyny nie zadziałają w pełni
- Logo drużyny wymaga przebudowy dev-clienta po `expo-image-picker`
- Po wgraniu 0032: bucket Storage `team-logos` powinien powstać automatycznie z migracji
