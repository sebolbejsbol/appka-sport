# Słownik wspólnych pojęć — Appka Sport

> Aby Sebastian i Claude rozumieli te same słowa tak samo. 
> Jeśli pojawi się nowy termin lub skrót myślowy, dopytaj i dopisz.

---

## Ludzie i role

- **Użytkownik** — osoba z kontem w aplikacji. Czasem mówimy "gracz" — to to samo.
- **Gracz** — synonim użytkownika, w kontekście grania w sport.
- **Organizator** — użytkownik, który stworzył dany event. Jest organizatorem TYLKO tego eventu, który stworzył. W innych eventach jest zwykłym uczestnikiem albo nie ma go wcale.
- **Uczestnik** — użytkownik zapisany na konkretny event.
- **Administrator (admin)** — Sebastian albo ktoś z zespołu. Zarządza CAŁĄ aplikacją z osobnego panelu webowego: weryfikuje boiska, rozpatruje zgłoszenia, banuje toksycznych użytkowników. Nie jest zwykłym graczem w aplikacji.
- **Znajomy** — inny użytkownik, którego ktoś dodał do listy znajomych (po wzajemnej akceptacji, jak na Facebooku).
- **Beta tester** — osoba, która testuje aplikację przed oficjalną publikacją.

> **UWAGA na skróty myślowe:** jeśli Sebastian użyje wyrażenia typu "administrator meczu" lub "moderator eventu", Claude DOPYTUJE co dokładnie ma na myśli, zamiast zgadywać. Standardowo: organizator meczu = osoba, która stworzyła event.

---

## Rzeczy w aplikacji

- **Event** — zaplanowane wydarzenie sportowe na konkretnym boisku, o konkretnej godzinie. Mówimy też "mecz" — na razie zamiennie.
- **Boisko** — fizyczna lokalizacja, gdzie odbywają się eventy. Z adresem i koordynatami GPS. Mówimy też "obiekt sportowy".
- **Dyscyplina** — rodzaj sportu (koszykówka, siatkówka, piłka nożna itd.). Mówimy też "sport".
- **Profil** — publiczna strona użytkownika w aplikacji ze zdjęciem, nickiem, statystykami i historią eventów. Inni użytkownicy mogą to oglądać.
- **Moje dane** — prywatne ustawienia użytkownika, których inni NIE widzą (email, hasło, ustawienia powiadomień itp.).
- **Nick** — publiczna nazwa użytkownika w aplikacji. Może być pseudonimem, nie musi być prawdziwym imieniem.

---

## Meldowanie

- **Meldowanie** — moment, kiedy gracz w aplikacji potwierdza, że jest fizycznie na boisku. Aplikacja sprawdza jego lokalizację GPS.
- **Meldowanie GPS** — automatyczne. Gracz klika "Zamelduj", aplikacja sprawdza, czy jest w promieniu 100m od boiska. Jeśli tak — meldunek zaliczony.
- **Meldowanie ręczne** — kiedy organizator eventu sam zaznacza w aplikacji, że gracz był na boisku, choć ten nie kliknął.
- **Okno meldowania** — czas, w którym aplikacja pozwala się zameldować. Otwiera się 20 minut przed startem eventu, zamyka się na koniec eventu. Zameldowanie po starcie = odnotowane spóźnienie + kara w randze.

---

## Postępy gracza

- **Ranga** — dynamiczny poziom umiejętności i wiarygodności w społeczności. Rośnie od częstej i punktualnej gry. Spada od długich przerw i spóźnień. Wzorowane na League of Legends. Szczegóły (odznaki, bonusy, dokładna mechanika punktów) — do ustalenia później.
- **Level / Poziom** — liczba rosnąca z każdą aktywnością gracza. W przeciwieństwie do rangi nie spada. Dokładny wzór do ustalenia.

---

## Komunikacja

- **DM (direct message)** — prywatna wiadomość między dwoma użytkownikami.
- **Chat grupowy** — chat między kilkoma osobami, niezwiązany z konkretnym eventem (np. paczka znajomych grających regularnie razem).
- **Chat eventu** — automatyczny chat grupowy powstający razem z eventem. Wszyscy zapisani na event mogą tam pisać.

---

## Moderacja

- **Zgłoszenie** — kiedy użytkownik raportuje innego użytkownika, event albo wiadomość jako nieodpowiednie. Trafia do panelu administratora.
- **Blokada** — kiedy użytkownik blokuje innego — zablokowany nie może już do niego pisać ani widzieć jego eventów.

---

## Projekt i obszar

- **MVP** — Minimum Viable Product. Pierwsza, najprostsza wersja aplikacji z absolutnym minimum funkcji potrzebnych do publikacji. Lepiej wystartować z mniejszą aplikacją i się uczyć niż czekać rok na "idealną" wersję.
- **TBD** — "To Be Decided", do ustalenia później. Oznaczenie rzeczy, których jeszcze nie zdecydowaliśmy.
- **Trójmiasto** — obszar startowy aplikacji: Gdańsk, Gdynia, Sopot.
- **i18n** — przygotowanie kodu, żeby łatwo dało się aplikację przetłumaczyć na inne języki w przyszłości. Robimy od pierwszego dnia, mimo że startujemy tylko po polsku.
- **SAFE DEFAULT** — wartość, którą można przyjąć tymczasowo, żeby nie blokować dewelopmentu, do potwierdzenia w przyszłości.

---

## Programowanie — pojęcia ogólne

- **Język programowania** — sposób, w jaki programista mówi komputerowi, co ma robić. Jest ich wiele (Python, Java, JavaScript itd.). Każdy ma swoje zalety.
- **TypeScript** — nasz główny język programowania. Bezpieczniejsza wersja popularnego JavaScript. Używany w aplikacji mobilnej i w logice po stronie serwera.
- **SQL** — język do rozmawiania z bazą danych. "Daj mi wszystkie eventy w Gdańsku jutro" — w SQL.
- **Biblioteka** — gotowy klocek kodu, który ktoś napisał i udostępnił. Programista bierze klocki zamiast pisać wszystko od zera. Jak LEGO.
- **Kod** — to co napisał programista. Tekst, z którego komputer wie, co ma robić.
- **Frontend** — to, co widzi użytkownik. W naszej apce: ekrany na telefonie.
- **Backend** — to, co dzieje się po stronie serwera. Niewidoczne dla użytkownika, ale tam są wszystkie dane i logika.
- **Baza danych** — uporządkowane miejsce, gdzie trzymamy informacje (konta, eventy, wiadomości). Jak gigantyczny Excel, ale szybszy i bezpieczniejszy.
- **Serwer** — komputer włączony 24/7, na którym działa backend i baza danych. Nasz serwer jest u firmy Supabase we Frankfurcie.
- **Hosting** — wynajem serwera od firmy zewnętrznej. Płacisz miesięcznie, oni dbają o sprzęt.
- **Edge Functions** — małe kawałki kodu logiki biznesowej, które działają na serwerach Supabase. Tam siedzi np. logika sprawdzająca, czy meldowanie jest w promieniu 100m.
- **Terminal** — ciemne okno, w którym wpisuje się polecenia tekstowe dla komputera (np. instalację programów).
- **npm / npx** — narzędzia do zarządzania bibliotekami w projekcie TypeScript. `npm` instaluje, `npx` uruchamia.

---

## Programy używane przez programistów

- **VS Code / Cursor** — edytor kodu. Tu programista pisze kod, jak Word do pisania programów.
- **GitHub** — magazyn kodu w chmurze. Pamięta każdą zmianę, pozwala kilku osobom pracować jednocześnie.
- **Expo CLI** — narzędzie, które uruchamia aplikację na telefonie/przeglądarce programisty podczas pracy.
- **Supabase Dashboard** — strona internetowa do zarządzania bazą danych i kontami użytkowników.
- **Sentry** — narzędzie do łapania błędów, gdy aplikacja jest już u użytkowników.

---

## Technologie, których używamy

- **React Native + Expo** — technologia, w której pisana jest aplikacja mobilna. Pozwala mieć jedną wersję dla iPhone i Androida.
- **Expo SDK 56** — konkretna wersja Expo, którą wybraliśmy (najnowsza stabilna).
- **Supabase** — firma, która dostarcza nam backend (serwery i bazę danych). Tam są przechowywane wszystkie konta, eventy, wiadomości. Serwery we Frankfurcie.
- **PostgreSQL** — typ bazy danych, którą wewnętrznie używa Supabase. Standard w branży. Ważne, bo dzięki temu możemy w razie czego przenieść dane do innego dostawcy.
- **PostGIS** — rozszerzenie PostgreSQL do zapytań geograficznych ("co jest w promieniu 5 km").
- **Mapbox** — firma, która dostarcza mapę widoczną w aplikacji.
- **OpenStreetMap (OSM)** — darmowa, otwarta baza map świata. Stamtąd pobierzemy listę boisk z Trójmiasta.
- **Node.js** — silnik, który uruchamia kod TypeScript. Wersja u Sebastiana: v24.16.0.

---

## App Store / Google Play

- **App Store** — sklep Apple, z którego użytkownicy iPhone'a pobierają aplikacje. Apple sprawdza każdą aplikację przed dopuszczeniem.
- **Google Play** — sklep Google, z którego użytkownicy Androida pobierają aplikacje. Mniej rygorystyczny niż Apple, ale też ma kontrolę.
- **Publikacja w sklepach** — proces zgłoszenia aplikacji do sklepów i czekania na akceptację. Apple zwykle 1–7 dni, Google 1–3 dni.
