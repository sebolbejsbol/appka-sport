# Plan produktowy — Appka Sport

> Plik produktowy: co budujemy, jakie decyzje są zatwierdzone, czego jeszcze nie ustaliliśmy. 
> Aktualizować przy każdej nowej decyzji.

---

## Cel projektu

Mobilna aplikacja do umawiania spotkań sportowych w realu. UX wzorowany na Uber/Bolt — **mapa jako główny ekran**, na której widać boiska i planowane mecze. Społeczność lokalna amatorów. Start: Trójmiasto, koszykówka.

Robocza nazwa: **Appka Sport** (właściwa nazwa do wymyślenia, jak będzie co pokazywać)

Właściciel produktu: Sebastian Choromański

---

## Zatwierdzone decyzje produktowe

### Zasięg geograficzny — plan rozwoju (WAŻNE dla architektury)

Aplikacja rośnie etapami, ale **kod i baza muszą być gotowe na cały świat od początku** (nie zaszywamy na sztywno Trójmiasta):

1. **Etap 1 — Trójmiasto** (Gdańsk + Gdynia + Sopot) — wejście na rynek, tu testujemy mechaniki i budujemy pierwszą społeczność.
2. **Etap 2 — cała Polska** — rozszerzenie importu boisk i marketingu na kolejne miasta/regiony.
3. **Etap 3 — cały świat** — pełna międzynarodowość (stąd i18n od pierwszego dnia).

**Zasady architektoniczne wynikające z tego planu (SAFE DEFAULTS):**

- **Bez hardkodowania regionu.** Trójmiasto to tylko *domyślny widok startowy*, a nie ograniczenie. Żadnych „if miasto == Trójmiasto" w logice.
- **Mapa centruje się na lokalizacji użytkownika (GPS).** Gdy brak zgody/lokalizacji — fallback na ostatnią pozycję, a w ostateczności na Trójmiasto. Dzięki temu apka „po prostu działa" wszędzie na świecie.
- **Boiska ładujemy po widocznym fragmencie mapy (bounding box / viewport),** a nie „wszystkie naraz". To jedyny sposób, żeby działało przy tysiącach/milionach boisk.
- **Zapytania geograficzne przez PostGIS** (współrzędne lat/lng + indeks przestrzenny GIST, funkcje typu „w promieniu X" / „w prostokącie"). Skaluje się od miasta do globu.
- **Import boisk z OSM parametryzowany obszarem** (bounding box / nazwa regionu) — ten sam skrypt uruchamiamy dla Trójmiasta teraz, potem dla kolejnych miast i krajów.
- **i18n + jednostki + strefy czasowe** — teksty już osobno (PL), docelowo kolejne języki; daty/godziny eventów liczone ze świadomością stref czasowych.

### Zasięg geograficzny — plan rozwoju (WAŻNE dla architektury)

Aplikacja rośnie etapami, ale **kod i baza muszą być gotowe na cały świat od początku** (nie zaszywamy na sztywno Trójmiasta):

1. **Etap 1 — Trójmiasto** (Gdańsk + Gdynia + Sopot) — wejście na rynek, tu testujemy mechaniki i budujemy pierwszą społeczność.
2. **Etap 2 — cała Polska** — rozszerzenie importu boisk i marketingu na kolejne miasta/regiony.
3. **Etap 3 — cały świat** — pełna międzynarodowość (stąd i18n od pierwszego dnia).

**Zasady architektoniczne wynikające z tego planu (SAFE DEFAULTS):**

- **Bez hardkodowania regionu.** Trójmiasto to tylko *domyślny widok startowy*, a nie ograniczenie. Żadnych „if miasto == Trójmiasto" w logice.
- **Mapa centruje się na lokalizacji użytkownika (GPS).** Gdy brak zgody/lokalizacji — fallback na ostatnią pozycję, a w ostateczności na Trójmiasto. Dzięki temu apka „po prostu działa" wszędzie na świecie.
- **Boiska ładujemy po widocznym fragmencie mapy (bounding box / viewport),** a nie „wszystkie naraz". To jedyny sposób, żeby działało przy tysiącach/milionach boisk.
- **Zapytania geograficzne przez PostGIS** (współrzędne lat/lng + indeks przestrzenny GIST, funkcje typu „w promieniu X" / „w prostokącie"). Skaluje się od miasta do globu.
- **Import boisk z OSM parametryzowany obszarem** (bounding box / nazwa regionu) — ten sam skrypt uruchamiamy dla Trójmiasta teraz, potem dla kolejnych miast i krajów.
- **i18n + jednostki + strefy czasowe** — teksty już osobno (PL), docelowo kolejne języki; daty/godziny eventów liczone ze świadomością stref czasowych.

### Zasięg geograficzny — plan rozwoju (WAŻNE dla architektury)

Aplikacja rośnie etapami, ale **kod i baza muszą być gotowe na cały świat od początku** (nie zaszywamy na sztywno Trójmiasta):

1. **Etap 1 — Trójmiasto** (Gdańsk + Gdynia + Sopot) — wejście na rynek, tu testujemy mechaniki i budujemy pierwszą społeczność.
2. **Etap 2 — cała Polska** — rozszerzenie importu boisk i marketingu na kolejne miasta/regiony.
3. **Etap 3 — cały świat** — pełna międzynarodowość (stąd i18n od pierwszego dnia).

**Zasady architektoniczne wynikające z tego planu (SAFE DEFAULTS):**

- **Bez hardkodowania regionu.** Trójmiasto to tylko *domyślny widok startowy*, a nie ograniczenie. Żadnych „if miasto == Trójmiasto" w logice.
- **Mapa centruje się na lokalizacji użytkownika (GPS).** Gdy brak zgody/lokalizacji — fallback na ostatnią pozycję, a w ostateczności na Trójmiasto. Dzięki temu apka „po prostu działa" wszędzie na świecie.
- **Boiska ładujemy po widocznym fragmencie mapy (bounding box / viewport),** a nie „wszystkie naraz". To jedyny sposób, żeby działało przy tysiącach/milionach boisk.
- **Zapytania geograficzne przez PostGIS** (współrzędne lat/lng + indeks przestrzenny GIST, funkcje typu „w promieniu X" / „w prostokącie"). Skaluje się od miasta do globu.
- **Import boisk z OSM parametryzowany obszarem** (bounding box / nazwa regionu) — ten sam skrypt uruchamiamy dla Trójmiasta teraz, potem dla kolejnych miast i krajów.
- **i18n + jednostki + strefy czasowe** — teksty już osobno (PL), docelowo kolejne języki; daty/godziny eventów liczone ze świadomością stref czasowych.

### Zasięg geograficzny — plan rozwoju (WAŻNE dla architektury)

Aplikacja rośnie etapami, ale **kod i baza muszą być gotowe na cały świat od początku** (nie zaszywamy na sztywno Trójmiasta):

1. **Etap 1 — Trójmiasto** (Gdańsk + Gdynia + Sopot) — wejście na rynek, tu testujemy mechaniki i budujemy pierwszą społeczność.
2. **Etap 2 — cała Polska** — rozszerzenie importu boisk i marketingu na kolejne miasta/regiony.
3. **Etap 3 — cały świat** — pełna międzynarodowość (stąd i18n od pierwszego dnia).

**Zasady architektoniczne wynikające z tego planu (SAFE DEFAULTS):**

- **Bez hardkodowania regionu.** Trójmiasto to tylko *domyślny widok startowy*, a nie ograniczenie. Żadnych „if miasto == Trójmiasto" w logice.
- **Mapa centruje się na lokalizacji użytkownika (GPS).** Gdy brak zgody/lokalizacji — fallback na ostatnią pozycję, a w ostateczności na Trójmiasto. Dzięki temu apka „po prostu działa" wszędzie na świecie.
- **Boiska ładujemy po widocznym fragmencie mapy (bounding box / viewport),** a nie „wszystkie naraz". To jedyny sposób, żeby działało przy tysiącach/milionach boisk.
- **Zapytania geograficzne przez PostGIS** (współrzędne lat/lng + indeks przestrzenny GIST, funkcje typu „w promieniu X" / „w prostokącie"). Skaluje się od miasta do globu.
- **Import boisk z OSM parametryzowany obszarem** (bounding box / nazwa regionu) — ten sam skrypt uruchamiamy dla Trójmiasta teraz, potem dla kolejnych miast i krajów.
- **i18n + jednostki + strefy czasowe** — teksty już osobno (PL), docelowo kolejne języki; daty/godziny eventów liczone ze świadomością stref czasowych.

### Zasięg geograficzny — plan rozwoju (WAŻNE dla architektury)

Aplikacja rośnie etapami, ale **kod i baza muszą być gotowe na cały świat od początku** (nie zaszywamy na sztywno Trójmiasta):

1. **Etap 1 — Trójmiasto** (Gdańsk + Gdynia + Sopot) — wejście na rynek, tu testujemy mechaniki i budujemy pierwszą społeczność.
2. **Etap 2 — cała Polska** — rozszerzenie importu boisk i marketingu na kolejne miasta/regiony.
3. **Etap 3 — cały świat** — pełna międzynarodowość (stąd i18n od pierwszego dnia).

**Zasady architektoniczne wynikające z tego planu (SAFE DEFAULTS):**

- **Bez hardkodowania regionu.** Trójmiasto to tylko *domyślny widok startowy*, a nie ograniczenie. Żadnych „if miasto == Trójmiasto" w logice.
- **Mapa centruje się na lokalizacji użytkownika (GPS).** Gdy brak zgody/lokalizacji — fallback na ostatnią pozycję, a w ostateczności na Trójmiasto. Dzięki temu apka „po prostu działa" wszędzie na świecie.
- **Boiska ładujemy po widocznym fragmencie mapy (bounding box / viewport),** a nie „wszystkie naraz". To jedyny sposób, żeby działało przy tysiącach/milionach boisk.
- **Zapytania geograficzne przez PostGIS** (współrzędne lat/lng + indeks przestrzenny GIST, funkcje typu „w promieniu X" / „w prostokącie"). Skaluje się od miasta do globu.
- **Import boisk z OSM parametryzowany obszarem** (bounding box / nazwa regionu) — ten sam skrypt uruchamiamy dla Trójmiasta teraz, potem dla kolejnych miast i krajów.
- **i18n + jednostki + strefy czasowe** — teksty już osobno (PL), docelowo kolejne języki; daty/godziny eventów liczone ze świadomością stref czasowych.

### Zasięg geograficzny — plan rozwoju (WAŻNE dla architektury)

Aplikacja rośnie etapami, ale **kod i baza muszą być gotowe na cały świat od początku** (nie zaszywamy na sztywno Trójmiasta):

1. **Etap 1 — Trójmiasto** (Gdańsk + Gdynia + Sopot) — wejście na rynek, tu testujemy mechaniki i budujemy pierwszą społeczność.
2. **Etap 2 — cała Polska** — rozszerzenie importu boisk i marketingu na kolejne miasta/regiony.
3. **Etap 3 — cały świat** — pełna międzynarodowość (stąd i18n od pierwszego dnia).

**Zasady architektoniczne wynikające z tego planu (SAFE DEFAULTS):**

- **Bez hardkodowania regionu.** Trójmiasto to tylko *domyślny widok startowy*, a nie ograniczenie. Żadnych „if miasto == Trójmiasto" w logice.
- **Mapa centruje się na lokalizacji użytkownika (GPS).** Gdy brak zgody/lokalizacji — fallback na ostatnią pozycję, a w ostateczności na Trójmiasto. Dzięki temu apka „po prostu działa" wszędzie na świecie.
- **Boiska ładujemy po widocznym fragmencie mapy (bounding box / viewport),** a nie „wszystkie naraz". To jedyny sposób, żeby działało przy tysiącach/milionach boisk.
- **Zapytania geograficzne przez PostGIS** (współrzędne lat/lng + indeks przestrzenny GIST, funkcje typu „w promieniu X" / „w prostokącie"). Skaluje się od miasta do globu.
- **Import boisk z OSM parametryzowany obszarem** (bounding box / nazwa regionu) — ten sam skrypt uruchamiamy dla Trójmiasta teraz, potem dla kolejnych miast i krajów.
- **i18n + jednostki + strefy czasowe** — teksty już osobno (PL), docelowo kolejne języki; daty/godziny eventów liczone ze świadomością stref czasowych.

### Zasięg geograficzny — plan rozwoju (WAŻNE dla architektury)

Aplikacja rośnie etapami, ale **kod i baza muszą być gotowe na cały świat od początku** (nie zaszywamy na sztywno Trójmiasta):

1. **Etap 1 — Trójmiasto** (Gdańsk + Gdynia + Sopot) — wejście na rynek, tu testujemy mechaniki i budujemy pierwszą społeczność.
2. **Etap 2 — cała Polska** — rozszerzenie importu boisk i marketingu na kolejne miasta/regiony.
3. **Etap 3 — cały świat** — pełna międzynarodowość (stąd i18n od pierwszego dnia).

**Zasady architektoniczne wynikające z tego planu (SAFE DEFAULTS):**

- **Bez hardkodowania regionu.** Trójmiasto to tylko *domyślny widok startowy*, a nie ograniczenie. Żadnych „if miasto == Trójmiasto" w logice.
- **Mapa centruje się na lokalizacji użytkownika (GPS).** Gdy brak zgody/lokalizacji — fallback na ostatnią pozycję, a w ostateczności na Trójmiasto. Dzięki temu apka „po prostu działa" wszędzie na świecie.
- **Boiska ładujemy po widocznym fragmencie mapy (bounding box / viewport),** a nie „wszystkie naraz". To jedyny sposób, żeby działało przy tysiącach/milionach boisk.
- **Zapytania geograficzne przez PostGIS** (współrzędne lat/lng + indeks przestrzenny GIST, funkcje typu „w promieniu X" / „w prostokącie"). Skaluje się od miasta do globu.
- **Import boisk z OSM parametryzowany obszarem** (bounding box / nazwa regionu) — ten sam skrypt uruchamiamy dla Trójmiasta teraz, potem dla kolejnych miast i krajów.
- **i18n + jednostki + strefy czasowe** — teksty już osobno (PL), docelowo kolejne języki; daty/godziny eventów liczone ze świadomością stref czasowych.

### Zasięg geograficzny — plan rozwoju (WAŻNE dla architektury)

Aplikacja rośnie etapami, ale **kod i baza muszą być gotowe na cały świat od początku** (nie zaszywamy na sztywno Trójmiasta):

1. **Etap 1 — Trójmiasto** (Gdańsk + Gdynia + Sopot) — wejście na rynek, tu testujemy mechaniki i budujemy pierwszą społeczność.
2. **Etap 2 — cała Polska** — rozszerzenie importu boisk i marketingu na kolejne miasta/regiony.
3. **Etap 3 — cały świat** — pełna międzynarodowość (stąd i18n od pierwszego dnia).

**Zasady architektoniczne wynikające z tego planu (SAFE DEFAULTS):**

- **Bez hardkodowania regionu.** Trójmiasto to tylko *domyślny widok startowy*, a nie ograniczenie. Żadnych „if miasto == Trójmiasto" w logice.
- **Mapa centruje się na lokalizacji użytkownika (GPS).** Gdy brak zgody/lokalizacji — fallback na ostatnią pozycję, a w ostateczności na Trójmiasto. Dzięki temu apka „po prostu działa" wszędzie na świecie.
- **Boiska ładujemy po widocznym fragmencie mapy (bounding box / viewport),** a nie „wszystkie naraz". To jedyny sposób, żeby działało przy tysiącach/milionach boisk.
- **Zapytania geograficzne przez PostGIS** (współrzędne lat/lng + indeks przestrzenny GIST, funkcje typu „w promieniu X" / „w prostokącie"). Skaluje się od miasta do globu.
- **Import boisk z OSM parametryzowany obszarem** (bounding box / nazwa regionu) — ten sam skrypt uruchamiamy dla Trójmiasta teraz, potem dla kolejnych miast i krajów.
- **i18n + jednostki + strefy czasowe** — teksty już osobno (PL), docelowo kolejne języki; daty/godziny eventów liczone ze świadomością stref czasowych.

### Zasięg geograficzny — plan rozwoju (WAŻNE dla architektury)

Aplikacja rośnie etapami, ale **kod i baza muszą być gotowe na cały świat od początku** (nie zaszywamy na sztywno Trójmiasta):

1. **Etap 1 — Trójmiasto** (Gdańsk + Gdynia + Sopot) — wejście na rynek, tu testujemy mechaniki i budujemy pierwszą społeczność.
2. **Etap 2 — cała Polska** — rozszerzenie importu boisk i marketingu na kolejne miasta/regiony.
3. **Etap 3 — cały świat** — pełna międzynarodowość (stąd i18n od pierwszego dnia).

**Zasady architektoniczne wynikające z tego planu (SAFE DEFAULTS):**

- **Bez hardkodowania regionu.** Trójmiasto to tylko *domyślny widok startowy*, a nie ograniczenie. Żadnych „if miasto == Trójmiasto" w logice.
- **Mapa centruje się na lokalizacji użytkownika (GPS).** Gdy brak zgody/lokalizacji — fallback na ostatnią pozycję, a w ostateczności na Trójmiasto. Dzięki temu apka „po prostu działa" wszędzie na świecie.
- **Boiska ładujemy po widocznym fragmencie mapy (bounding box / viewport),** a nie „wszystkie naraz". To jedyny sposób, żeby działało przy tysiącach/milionach boisk.
- **Zapytania geograficzne przez PostGIS** (współrzędne lat/lng + indeks przestrzenny GIST, funkcje typu „w promieniu X" / „w prostokącie"). Skaluje się od miasta do globu.
- **Import boisk z OSM parametryzowany obszarem** (bounding box / nazwa regionu) — ten sam skrypt uruchamiamy dla Trójmiasta teraz, potem dla kolejnych miast i krajów.
- **i18n + jednostki + strefy czasowe** — teksty już osobno (PL), docelowo kolejne języki; daty/godziny eventów liczone ze świadomością stref czasowych.

### Zasięg i użytkownicy

- **Obszar startowy:** Trójmiasto (Gdańsk + Gdynia + Sopot) — patrz: plan rozwoju geograficznego wyżej — patrz: plan rozwoju geograficznego wyżej — patrz: plan rozwoju geograficznego wyżej — patrz: plan rozwoju geograficznego wyżej — patrz: plan rozwoju geograficznego wyżej — patrz: plan rozwoju geograficznego wyżej — patrz: plan rozwoju geograficznego wyżej — patrz: plan rozwoju geograficznego wyżej — patrz: plan rozwoju geograficznego wyżej
- **Wiek:** 16+ only. Rejestracja pyta o rok urodzenia. Poniżej 16 — brak dostępu, bez ścieżki zgody rodzica.
- **Pierwszy sport (marketingowo):** koszykówka. Apka technicznie obsługuje wszystkie sporty od początku, ale komunikujemy się głównie wokół kosza.
- **Platforma:** cross-platform — iOS + Android z jednego kodu (React Native + Expo)
- **i18n:** tak, od pierwszego dnia. Apka po polsku, ale teksty trzymane osobno, łatwe do tłumaczenia w przyszłości.

### Profil użytkownika

- **Zdjęcie profilowe:** opcjonalne. Brak zdjęcia = placeholder z inicjałami.
- **Wiek na profilu:** rok urodzenia (nie pełna data) + opcja "nie pokazuj"
- **Płeć:** opcjonalna, z opcją "nie podaję"

### Boiska

- **Źródło początkowe:** automatyczny import z OpenStreetMap. Skrypt **parametryzowany obszarem** (bounding box / region) — najpierw Trójmiasto, potem kolejne miasta i kraje tym samym narzędziem.
- **Weryfikacja:** admin (Sebastian / zespół) przegląda i akceptuje każde boisko przed publikacją
- **Brakujące boiska:** użytkownicy mogą zgłaszać → trafiają do panelu admina do weryfikacji

### Meldowanie (najważniejsza mechanika apki)

- **Promień GPS:** 100 m od boiska
- **Okno otwarcia:** 20 min przed planowanym startem eventu
- **Okno zamknięcia:** koniec eventu (patrz: koniec eventu)
- **Spóźnienie:** meldunek po starcie eventu jest możliwy, ale odnotowany jako spóźnienie i powoduje karę w randze
- **Organizator:** melduje się jak każdy inny zawodnik (jego aktywność też się liczy)
- **Po wygaśnięciu okna:** meldunek możliwy tylko ręcznie przez organizatora

### Koniec eventu

- Organizator **może** podać godzinę zakończenia, ale **nie musi**
- Po zaplanowanym końcu (lub po 2h od startu, jeśli organizator nie podał końca) apka pyta organizatora: **"czy nadal trwa?"**
  - **Tak** → przedłużenie, opcjonalnie z podaniem o ile
  - **Nie** → koniec eventu
- Można przedłużać wielokrotnie
- Organizator może w dowolnym momencie kliknąć "Zakończ event"

### Ranga i level

- **Ranga** — dynamiczny poziom umiejętności i wiarygodności. Wzorowana mechanika na League of Legends:
  - Rośnie od częstej i punktualnej gry
  - Spada od długich przerw i spóźnień
  - Szczegółowa mechanika (odznaki, bonusy, dokładne wzory): **TBD** — do osobnej rozmowy. Plan zostawia na to przestrzeń architektoniczną.
- **Level** — liczba rosnąca z każdą aktywnością. Nie spada. 
  - Tymczasowy wzór (SAFE DEFAULT): `level = floor(liczba_zameldowanych_eventów / 5) + 1`
  - Docelowy wzór: TBD

### Powiadomienia

Apka wysyła push przy:
- Dołączeniu kogoś do mojego eventu
- Starcie mojego eventu (przypomnienie)
- Otwarciu okna meldowania (na 20 min przed)
- Nowej wiadomości w czacie
- Zaproszeniu do znajomych
- Zmianie/anulowaniu eventu, na który jestem zapisany

### Prywatność i bezpieczeństwo

- Lokalizacja pobierana **tylko na żądanie** (gdy użytkownik otwiera mapę, szuka w pobliżu, albo melduje) — nie w tle
- Możliwość zgłoszenia użytkownika / treści
- Możliwość zablokowania użytkownika
- Możliwość usunięcia konta

---

## TBDy — do ustalenia w przyszłości

- Dokładna mechanika punktów rangi (odznaki, bonusy, formuły)
- Lista rezerwowa do eventów (czy w MVP, czy później)
- Prywatne eventy (tylko dla znajomych)
- Możliwość usuwania uczestników przez organizatora
- Wyniki meczów (czy organizator wpisuje wynik)
- Oceny graczy po meczu
- Płatności i rezerwacje boisk (poza MVP)
- Okno przywrócenia po usunięciu konta (np. 30 dni)

---

## Stos technologiczny

- **Mobile:** React Native + Expo (TypeScript)
- **Backend + DB + Auth + Storage + Realtime:** Supabase (PostgreSQL + PostGIS)
- **Lokalizacja serwerów Supabase:** Frankfurt (EU — RODO)
- **Mapa:** Mapbox
- **Push:** Expo Push Service
- **Crash reporting:** Sentry
- **Analytics:** PostHog (opcjonalnie)
- **Język kodu:** TypeScript (mobile + backend)
- **Edytor:** Cursor (z Claude jako asystentem)

---

## Co świadomie odpuszczamy w MVP

- Płatności
- Rezerwacje czasów boisk z opłatą
- Wyniki meczów
- Oceny graczy
- Prywatne eventy
- Lista rezerwowa
- Pełna mechanika rangi (zostawiamy haczyk architektoniczny, dokładamy w kolejnej iteracji)
- Apple Developer account ($99/rok) — kupujemy dopiero blisko publikacji
- Google Play account ($25 jednorazowo) — j.w.
- Prawnik — regulamin i polityka prywatności generowane przez AI, do weryfikacji prawnej dopiero przed publikacją
