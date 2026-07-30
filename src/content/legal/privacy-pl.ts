import type { LegalDocument } from './types';

export const privacyPl: LegalDocument = {
  title: 'Polityka prywatności i informacja o przetwarzaniu danych osobowych',
  updatedAt: '17 czerwca 2026',
  sections: [
    {
      title: 'I. Administrator i inspektor kontaktu',
      paragraphs: [
        'Zgodnie z art. 13 i 14 Rozporządzenia Parlamentu Europejskiego i Rady (UE) 2016/679 z dnia 27 kwietnia 2016 r. w sprawie ochrony osób fizycznych w związku z przetwarzaniem danych osobowych i w sprawie swobodnego przepływu takich danych oraz uchylenia dyrektywy 95/46/WE (ogólne rozporządzenie o ochronie danych), zwanego dalej „RODO”, informuje się, że administratorem danych osobowych Użytkowników środowiska programowego Appka Sport jest Sebastian Choromański.',
        'W sprawach związanych z ochroną danych osobowych, realizacją praw podmiotu danych oraz składaniem żądań i reklamacji w rozumieniu RODO, kontakt możliwy jest pod adresem elektronicznym: sebastianchorom@gmail.com. Administrator nie wyznaczył inspektora ochrony danych, o ile obowiązek taki nie wynika z przepisów szczególnych mających zastosowanie do skali i charakteru przetwarzania.',
      ],
    },
    {
      title: 'II. Kategorie danych osobowych i źródła pochodzenia',
      paragraphs: [
        'W ramach świadczenia usług drogą elektroniczną Administrator może przetwarzać następujące kategorie danych osobowych, w zależności od zakresu faktycznego korzystania z funkcjonalności Aplikacji: (a) dane identyfikacyjne i kontaktowe — adres poczty elektronicznej; (b) dane uwierzytelniające — hasło dostępu przechowywane wyłącznie w postaci zaszyfrowanej lub zhashowanej u zewnętrznego dostawcy usług tożsamości; (c) dane profilowe — publiczny identyfikator tekstowy (nick), rok urodzenia, opcjonalnie płeć oraz preferencje widoczności wybranych atrybutów; (d) dane geolokalizacyjne — współrzędne geograficzne urządzenia końcowego, pod warunkiem wyrażenia zgody systemowej i aktywacji funkcji wymagających lokalizacji, bez prowadzenia śledzenia w tle w rozumieniu ciągłego monitoringu poza żądaniem Użytkownika; (e) dane dotyczące aktywności w Usłudze — m.in. uczestnictwo w jednostkach organizacyjnych aktywności, operacje potwierdzania obecności, zgłoszenia propozycyjne obiektów; (f) dane techniczne — identyfikatory sesji, znaczniki czasu operacji, tokeny powiadomień push, podstawowe logi serwera niezbędne do diagnostyki i bezpieczeństwa.',
        'Dane osobowe pochodzą co do zasady bezpośrednio od Użytkownika (formularze, interakcje z interfejsem) lub powstają w wyniku automatycznego rejestrowania czynności wykonywanych w Aplikacji. W odniesieniu do danych geolokalizacyjnych źródłem jest urządzenie końcowe Użytkownika, po uprzednim uzyskaniu uprawnienia na poziomie systemu operacyjnego.',
      ],
    },
    {
      title: 'III. Cele przetwarzania i podstawy prawne',
      paragraphs: [
        'Dane osobowe przetwarzane są w następujących celach i na następujących podstawach prawnych, zgodnie z art. 6 RODO: (1) zawarcie i wykonanie umowy o świadczenie usług drogą elektroniczną — obejmujące rejestrację, uwierzytelnianie, utrzymanie Konta oraz świadczenie funkcjonalności opisanych w Regulaminie (art. 6 ust. 1 lit. b RODO); (2) realizacja obowiązków prawnych ciążących na Administratorze, jeżeli wystąpią w konkretnym stanie faktycznym (art. 6 ust. 1 lit. c RODO); (3) dochodzenie lub obrona przed roszczeniami — prawnie uzasadniony interes Administratora (art. 6 ust. 1 lit. f RODO); (4) zapewnienie bezpieczeństwa Usługi, w tym wykrywanie nadużyć i moderacja treści — prawnie uzasadniony interes Administratora (art. 6 ust. 1 lit. f RODO); (5) prezentacja danych przestrzennych i koordynacja aktywności w oparciu o lokalizację — w zakresie, w jakim wymaga to danych geolokalizacyjnych, na podstawie zgody Użytkownika wyrażonej w ustawieniach urządzenia oraz poprzez korzystanie z odpowiedniej funkcji (art. 6 ust. 1 lit. a RODO w zw. z art. 9 ust. 2 lit. a RODO, jeżeli ma zastosowanie); (6) wysyłanie powiadomień komunikacyjnych na urządzenie końcowe — na podstawie zgody Użytkownika, z możliwością wycofania w dowolnym momencie bez wpływu na zgodność z prawem przetwarzania dokonanego przed wycofaniem (art. 6 ust. 1 lit. a RODO).',
        'Administrator nie przetwarza danych osobowych w celach marketingowych podmiotów trzecich ani nie dokonuje zbycia danych osobowych w rozumieniu odpłatnego przekazania katalogów Użytkowników podmiotom zewnętrznym.',
      ],
    },
    {
      title: 'IV. Odbiorcy danych i kategorie podmiotów przetwarzających',
      paragraphs: [
        'W zakresie niezbędnym do świadczenia Usługi dane osobowe mogą być udostępniane następującym kategoriom odbiorców, działającym co do zasady jako podmioty przetwarzające na podstawie umów powierzenia przetwarzania danych: (a) Supabase, Inc. — hosting bazy danych, uwierzytelnianie i przechowywanie danych aplikacyjnych, z wykorzystaniem infrastruktury zlokalizowanej w regionie Unii Europejskiej (Frankfurt, państwo członkowskie UE); (b) Mapbox, Inc. — renderowanie warstw kartograficznych, z przekazywaniem parametrów widocznego obszaru mapy oraz zapytań geoprzestrzennych niezbędnych do działania modułu mapowego; (c) Expo / dostawcy usług powiadomień push — dostarczanie komunikatów na urządzenie końcowe Użytkownika, po uprzedniej rejestracji tokena urządzenia.',
        'Inni Użytkownicy Usługi mogą uzyskać wgląd wyłącznie w dane jawne w rozumieniu profilu publicznego — w szczególności nick oraz atrybuty, które Użytkownik zdecydował się uczynić widocznymi. Adres poczty elektronicznej nie jest udostępniany innym Użytkownikom w ramach standardowego modelu danych.',
        'Dane mogą zostać ujawnione organom publicznym uprawnionym na podstawie przepisów prawa, w zakresie i trybie przez nie wskazanym.',
      ],
    },
    {
      title: 'V. Okres przechowywania i zasady retencji',
      paragraphs: [
        'Dane osobowe przechowywane są przez okres nie dłuższy, niż jest to niezbędne do realizacji celów, dla których zostały zebrane, z uwzględnieniem następujących zasad retencji: dane Konta — do czasu usunięcia Konta na wniosek Użytkownika lub rozwiązania umowy, z możliwością dalszego przechowywania w zakresie wynikającym z przepisów prawa lub przedawnienia roszczeń; dane geolokalizacyjne wykorzystywane operacyjnie — przez czas trwania sesji funkcjonalnej lub do momentu wycofania zgody, z zastrzeżeniem archiwizacji wyłącznie tam, gdzie jest to konieczne do wykazania przebiegu operacji potwierdzania obecności; tokeny powiadomień — do czasu wyłączenia powiadomień lub usunięcia Konta; logi techniczne — przez okres adekwatny do celów bezpieczeństwa, z reguły nieprzekraczający okresów wynikających z dobrych praktyk branżowych, o ile dłuższe przechowywanie nie jest wymagane przepisami.',
        'Po upływie okresu retencji dane podlegają usunięciu lub anonimizacji w sposób uniemożliwiający identyfikację osoby fizycznej, chyba że dalsze przechowywanie jest wymagane bezwzględnie obowiązującymi przepisami.',
      ],
    },
    {
      title: 'VI. Prawa podmiotu danych',
      paragraphs: [
        'Użytkownikowi, którego dane osobowe są przetwarzane, przysługują — na zasadach i w granicach określonych w RODO — następujące uprawnienia: prawo dostępu do danych (art. 15 RODO); prawo do sprostowania danych (art. 16 RODO); prawo do usunięcia danych („prawo do bycia zapomnianym”) w przypadkach przewidzianych w art. 17 RODO; prawo do ograniczenia przetwarzania (art. 18 RODO); prawo do przenoszenia danych, o ile ma zastosowanie (art. 20 RODO); prawo sprzeciwu wobec przetwarzania opartego na art. 6 ust. 1 lit. f RODO, z uwzględnieniem wyjątków przewidzianych w art. 21 RODO; prawo wycofania zgody w dowolnym momencie, jeżeli przetwarzanie odbywa się na podstawie zgody, bez wpływu na zgodność z prawem przetwarzania dokonanego przed wycofaniem.',
        'W celu realizacji powyższych uprawnień należy skontaktować się z Administratorem za pośrednictwem adresu wskazanego w części I. Administrator udziela odpowiedzi bez zbędnej zwłoki, nie później niż w terminach wynikających z art. 12 RODO.',
        'Użytkownik ma prawo wnieść skargę do organu nadzorczego — Prezesa Urzędu Ochrony Danych Osobowych, ul. Stawki 2, 00-193 Warszawa — jeżeli uzna, iż przetwarzanie narusza przepisy o ochronie danych osobowych.',
      ],
    },
    {
      title: 'VII. Zautomatyzowane podejmowanie decyzji i profilowanie',
      paragraphs: [
        'Administrator informuje, że w ramach standardowego modelu operacyjnego Usługi nie dochodzi do zautomatyzowanego podejmowania decyzji w rozumieniu art. 22 RODO, które wywoływałoby wobec Użytkownika skutki prawne lub w podobny sposób istotnie na niego wpływało, z wyłączeniem mechanizmów technicznych o charakterze walidacyjnym (np. weryfikacja parametrów geolokalizacyjnych, kontrola limitów operacyjnych), które nie stanowią profilowania w rozumieniu marketingowym ani oceny wiarygodności kredytowej.',
      ],
    },
    {
      title: 'VIII. Środki bezpieczeństwa i poufność',
      paragraphs: [
        'Administrator stosuje środki techniczne i organizacyjne adekwatne do zidentyfikowanych ryzyk, w tym m.in.: szyfrowanie transmisji danych protokołem HTTPS/TLS; kontrolę dostępu do warstwy danych poprzez mechanizmy uprawnień na poziomie bazy danych; segregację środowisk; ograniczenie dostępu administracyjnego do podmiotów uprawnionych; przechowywanie poświadczeń uwierzytelniających w formie zaszyfrowanej u wyspecjalizowanego dostawcy tożsamości.',
        'Pomimo wdrożenia powyższych środków, Użytkownik powinien stosować silne, unikalne hasło oraz zachować ostrożność przy korzystaniu z urządzeń współdzielonych; żaden system informatyczny nie gwarantuje absolutnej odporności na incydenty bezpieczeństwa.',
      ],
    },
    {
      title: 'IX. Przekazywanie danych poza EOG',
      paragraphs: [
        'Co do zasady dane przetwarzane są na terytorium Unii Europejskiej, w szczególności w regionie infrastruktury wskazanym w części IV. W przypadku korzystania z podmiotów przetwarzających mających siedzibę poza Europejskim Obszarem Gospodarczym, Administrator dąży do zapewnienia odpowiedniego poziomu ochrony poprzez stosowanie standardowych klauzul umownych Komisji Europejskiej lub innych mechanizmów przewidzianych w rozdziale V RODO, o ile przekazanie takie nastąpi.',
      ],
    },
    {
      title: 'X. Zmiany Polityki Prywatności',
      paragraphs: [
        'Administrator zastrzega prawo do aktualizacji niniejszej Polityki Prywatności w przypadku zmiany zakresu przetwarzania, wdrożenia nowych funkcjonalności, zmiany podmiotów przetwarzających lub konieczności dostosowania do orzecznictwa i wytycznych organów nadzorczych. Aktualna wersja dokumentu jest publikowana w Aplikacji wraz ze wskazaniem daty ostatniej aktualizacji.',
        'O zmianach o istotnym charakterze Użytkownik zostanie poinformowany w sposób umożliwiający zapoznanie się z nowym brzmieniem przed dalszym korzystaniem z Usługi, w zakresie wymaganym przepisami prawa.',
      ],
    },
  ],
};
