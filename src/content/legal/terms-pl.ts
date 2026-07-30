import type { LegalDocument } from './types';

export const termsPl: LegalDocument = {
  title: 'Regulamin świadczenia usług drogą elektroniczną',
  updatedAt: '17 czerwca 2026',
  sections: [
    {
      title: '§ 1. Definicje i konstrukcja interpretacyjna',
      paragraphs: [
        'Na potrzeby niniejszego Regulaminu, o ile z kontekstu jednoznacznie nie wynika inaczej, przyjmuje się następujące znaczenie pojęć: „Usługodawca” — Sebastian Choromański, będący podmiotem zarządzającym środowiskiem programowym udostępnianym pod nazwą handlową Appka Sport; „Usługa” — kompleks funkcjonalności udostępnianych Użytkownikowi Końcowemu za pośrednictwem Aplikacji, obejmujący w szczególności, lecz nie wyłącznie, moduły tożsamości cyfrowej, prezentacji danych przestrzennych, synchronizacji aktywności społecznościowej oraz mechanizmów weryfikacyjnych; „Aplikacja” — oprogramowanie mobilne oraz powiązane komponenty serwerowe, stanowiące nośnik Usługi; „Użytkownik Końcowy” lub „Użytkownik” — osoba fizyczna posiadająca zdolność do czynności prawnych w zakresie wymaganym przepisami prawa, która dokonała procedury rejestracyjnej albo korzysta z Usługi w inny dopuszczalny sposób; „Konto” — indywidualny zbiór uprawnień i atrybutów przypisanych do Użytkownika w systemie tożsamości Usługodawcy.',
        'Postanowienia Regulaminu należy interpretować zgodnie z obowiązującymi przepisami prawa polskiego, w szczególności ustawą z dnia 18 lipca 2002 r. o świadczeniu usług drogą elektroniczną, ustawą z dnia 23 kwietnia 1964 r. — Kodeks cywilny oraz aktami wykonawczymi i orzecznictwem powszechnie obowiązującym, bez uszczerbku dla norm bezwzględnie obowiązujących.',
        'Nagłówki jednostek redakcyjnych Regulaminu mają charakter pomocniczy i nie determinują samodzielnie zakresu interpretacyjnego postanowień paragrafów, którym są podporządkowane.',
      ],
    },
    {
      title: '§ 2. Akceptacja, wejście w życie i kontakt',
      paragraphs: [
        'Rozpoczęcie korzystania z Usługi, w tym w szczególności przejście procedury rejestracyjnej, złożenie oświadczenia woli o akceptacji dokumentów prawnych oraz dalsze, faktyczne wykorzystywanie funkcjonalności Aplikacji, jest równoznaczne z zawarciem umowy o świadczenie usług drogą elektroniczną na warunkach określonych w niniejszym Regulaminie oraz w Polityce Prywatności, stanowiącej integralną część stosu dokumentów regulujących relację Usługodawca — Użytkownik.',
        'W przypadku braku akceptacji któregokolwiek z postanowień niniejszego Regulaminu Użytkownik zobowiązany jest powstrzymać się od korzystania z Usługi, pod rygorem uznania, iż każda próba obejścia ograniczeń technicznych lub proceduralnych stanowi naruszenie Regulaminu.',
        'Kanał komunikacji w sprawach związanych z Regulaminem, reklamacjami oraz realizacją uprawnień: sebastianchorom@gmail.com. Usługodawca rozpatruje korespondencję w terminach wynikających z powszechnie obowiązujących przepisów, z zastrzeżeniem okresów wzmożonego obciążenia operacyjnego Usługi.',
      ],
    },
    {
      title: '§ 3. Kwalifikacja podmiotowa Użytkownika',
      paragraphs: [
        'Usługa jest adresowana wyłącznie do osób fizycznych, które ukończyły szesnasty rok życia. Dokonując rejestracji Użytkownik składa oświadczenie, iż spełnia powyższy warunek wiekowy; oświadczenie to stanowi element procedury kontraktowej i może podlegać weryfikacji w zakresie dopuszczalnym prawem.',
        'Usługodawca nie prowadzi odrębnej ścieżki uzyskiwania zgody opiekuna prawnego na korzystanie z Usługi przez osoby małoletnie poniżej progu wiekowego wskazanego w ust. 1 niniejszego paragrafu; osoby takie nie są uprawnione do założenia Konta.',
        'Na jedną osobę fizyczną przypada co do zasady jedno Konto. Identyfikator publiczny (nick) jest nadawany w toku rejestracji i — z uwagi na integralność rejestrów społecznościowych oraz mechanizmów antyduplikacyjnych — nie podlega późniejszej modyfikacji przez Użytkownika w ramach standardowego interfejsu samoobsługowego.',
      ],
    },
    {
      title: '§ 4. Przedmiot i charakter prawny Usługi',
      paragraphs: [
        'Usługodawca udostępnia narzędzie techniczne umożliwiające Użytkownikom koordynację aktywności rekreacyjnej w przestrzeni geograficznej, w tym prezentację obiektów o charakterze infrastruktury sportowej pochodzących z rejestrów zewnętrznych oraz zgłoszeń społecznościowych, a także tworzenie i obsługę jednostek organizacyjnych aktywności (zwanych dalej „Zdarzeniami”) w rozumieniu wewnętrznej taksonomii systemowej.',
        'Usługodawca nie jest organizatorem zawodów, rozgrywek ligowych, podmiotem zarządzającym obiektami sportowymi ani gwarantem dostępności infrastruktury fizycznej. Wszelka aktywność o charakterze ruchowym realizowana poza warstwą programową odbywa się na wyłączne ryzyko Użytkowników, przy zachowaniu zasad współżycia społecznego oraz przepisów powszechnie obowiązujących.',
        'Dane przestrzenne i opisowe prezentowane w Aplikacji mają charakter informacyjny i mogą wykazywać rozbieżności względem stanu faktycznego; Usługodawca zastrzega prawo do korekty, moderacji, czasowego wycofania lub trwałego odrzucenia wpisów w ramach procesów weryfikacyjnych, o których mowa w dalszych postanowieniach.',
      ],
    },
    {
      title: '§ 5. Rejestracja, uwierzytelnianie i bezpieczeństwo Konta',
      paragraphs: [
        'Warunkiem korzystania z pełnego zakresu Usługi jest przejście procedury rejestracji, obejmującej podanie adresu elektronicznego, hasła dostępu spełniającego minimalne kryteria entropii określone w interfejsie, danych profilowych wymaganych w formularzu oraz akceptację dokumentów prawnych.',
        'Użytkownik zobowiązany jest do zachowania poufności danych uwierzytelniających i nieudostępniania Konta osobom trzecim; za działania dokonane przy użyciu prawidłowo uwierzytelnionej sesji domniemywa się, że zostały podjęte przez Użytkownika, chyba że Użytkownik niezwłocznie zgłosi incydent bezpieczeństwa na adres wskazany w § 2.',
        'Usługodawca stosuje mechanizmy kontroli dostępu oparte na rolach systemowych; nadanie uprawnień administracyjnych nie jest możliwe w drodze samoobsługi Użytkownika i wymaga interwencji po stronie infrastruktury zarządczej.',
        'Użytkownik może wystąpić z żądaniem usunięcia Konta; żądanie podlega realizacji w terminie adekwatnym do charakteru operacji, z uwzględnieniem obowiązków archiwizacyjnych wynikających z przepisów prawa oraz konieczności zabezpieczenia roszczeń Usługodawcy.',
      ],
    },
    {
      title: '§ 6. Zdarzenia, uczestnictwo i mechanizmy potwierdzania obecności',
      paragraphs: [
        'Tworzenie Zdarzenia wiąże się z nadaniem Użytkownikowi statusu organizatora w odniesieniu do konkretnej jednostki aktywności; status ten nie rozszerza się automatycznie na inne Zdarzenia ani nie implikuje uprawnień administracyjnych w rozumieniu § 5 ust. 3.',
        'Uczestnictwo w Zdarzeniu regulują reguły dostępności określone w interfejsie w danym momencie obowiązywania wersji Aplikacji, w tym ograniczenia pojemnościowe, jeżeli zostały zdefiniowane przez organizatora.',
        'Warstwa programowa może udostępniać mechanizm potwierdzania obecności Użytkownika w zdefiniowanej strefie przestrzennej i przedziale czasowym względem parametrów Zdarzenia; skuteczność potwierdzenia zależy od jakości sygnału geolokalizacyjnego, konfiguracji urządzenia końcowego oraz zgodności z algorytmami walidacyjnymi stosowanymi po stronie serwera.',
        'Po wygaśnięciu okna czasowego dopuszczalnego dla automatycznego potwierdzenia obecności dopuszczalne jest — w granicach technicznych systemu — potwierdzenie manualne przez organizatora Zdarzenia lub podmiot o uprawnieniach moderacyjnych, z zastrzeżeniem odpowiedzialności za rzetelność takiego działania.',
        'Nadużycie mechanizmów potwierdzania obecności, w tym dostarczanie fałszywych wskazań geolokalizacyjnych lub obchodzenie zabezpieczeń, może skutkować ograniczeniem funkcjonalności Konta, czasowym zawieszeniem lub trwałym wyłączeniem z Usługi, bez uszczerbku dla innych środków prawnych.',
      ],
    },
    {
      title: '§ 7. Zgłoszenia społecznościowe i moderacja treści',
      paragraphs: [
        'Użytkownik może inicjować wpisy o charakterze propozycyjnym dotyczące obiektów nieujętych w aktualnym zbiorze danych przestrzennych; wpisy takie trafiają do kolejki weryfikacyjnej i nie są prezentowane w warstwie publicznej do czasu pozytywnej decyzji moderacyjnej.',
        'Podmiot uprawniony do moderacji może zatwierdzić, odrzucić lub skorygować wpis, w tym dokonać modyfikacji nazwy właściwej przed publikacją; decyzja negatywna może zostać opatrzona adnotacją wewnętrzną widoczną w panelu moderacyjnym.',
        'Usługodawca zastrzega sobie prawo do ingerencji w treści Zdarzeń, profile publiczne oraz inne elementy generowane przez Użytkowników, jeżeli naruszają one Regulamin, przepisy prawa lub dobre obyczaje, w tym do ich edycji, ukrycia lub usunięcia.',
      ],
    },
    {
      title: '§ 8. Obowiązki Użytkownika i zakaz naruszeń',
      paragraphs: [
        'Użytkownik zobowiązuje się korzystać z Usługi w sposób zgodny z Regulaminem, Polityką Prywatności, przepisami prawa oraz zasadami współżycia społecznego, w szczególności powstrzymywać się od: podszywania się pod inne osoby; stosowania identyfikatorów wprowadzających w błąd; publikowania treści obraźliwych, dyskryminujących lub zagrażających bezpieczeństwu; automatycznego pozyskiwania danych (scrapingu) bez uprzedniej pisemnej zgody Usługodawcy; dekompilacji, reverse engineeringu lub obchodzenia zabezpieczeń, o ile nie jest to dozwolone bezwzględnie obowiązującym prawem.',
        'Naruszenie postanowień niniejszego paragrafu uprawnia Usługodawcę do zastosowania środków sankcyjnych proporcjonalnych do wagi naruszenia, o czym mowa w § 10.',
      ],
    },
    {
      title: '§ 9. Odpowiedzialność Usługodawcy i wyłączenia',
      paragraphs: [
        'Usługa jest udostępniana w fazie rozwojowej; Usługodawca nie udziela gwarancji nieprzerwanego działania, bezbłędności prezentowanych danych ani pełnej zgodności funkcjonalności z indywidualnymi oczekiwaniami Użytkownika, w najszerszym zakresie dopuszczalnym przez przepisy prawa.',
        'Bez uszczerbku dla uprawnień Użytkownika wynikających z bezwzględnie obowiązujących norm konsumenckich, Usługodawca nie ponosi odpowiedzialności za szkody powstałe w związku z udziałem w aktywności fizycznej realizowanej poza Aplikacją, w tym urazy, szkody majątkowe, utratę dóbr niematerialnych oraz szkody pośrednie i utracone korzyści, chyba że szkoda została wyrządzona umyślnie.',
        'Usługodawca nie gwarantuje frekwencji Użytkowników zapisanych na Zdarzenie ani dostępności obiektu w sensie faktycznym; prezentowane wskaźniki i liczniki mają charakter operacyjny wewnątrz systemu.',
      ],
    },
    {
      title: '§ 10. Sankcje, rozwiązanie i zmiany Regulaminu',
      paragraphs: [
        'W przypadku stwierdzenia naruszenia Regulaminu Usługodawca może zastosować środki o charakterze technicznym i organizacyjnym, w tym czasowe ograniczenie funkcji, blokadę Konta lub trwałe usunięcie Konta, z możliwością zachowania danych w zakresie wymaganym przepisami prawa.',
        'Usługodawca zastrzega prawo do jednostronnej zmiany Regulaminu z ważnych przyczyn, w szczególności: zmiany przepisów prawa, zmiany zakresu Usługi, konieczności dostosowania zabezpieczeń. O istotnych zmianach Użytkownik zostanie poinformowany za pośrednictwem Aplikacji lub kanału elektronicznego przypisanego do Konta.',
        'Dalsze korzystanie z Usługi po wejściu w życie zmian Regulaminu, w braku wypowiedzenia umowy w sposób przewidziany przepisami, uznaje się za akceptację nowego brzmienia Regulaminu.',
        'Regulamin wchodzi w życie z dniem publikacji w Aplikacji i obowiązuje przez czas nieoznaczony, do czasu zastąpienia przez Regulamin o nowym brzmieniu.',
      ],
    },
  ],
};
