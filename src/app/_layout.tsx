// UWAGA: importować WYŁĄCZNIE z podścieżki per-waga (np. ibm-plex-sans/400Regular),
// NIGDY z korzenia pakietu (@expo-google-fonts/ibm-plex-sans) — korzeń re-eksportuje
// KAŻDĄ wagę i kursywę całej rodziny (u IBM Plex Sans/Mono to 16 plików ~220KB/~140KB
// każdy), więc import jednego named exportu z korzenia i tak dociąga całe ~6.8MB
// fontów w buildzie webowym (require() assetu jest efektem ubocznym, nie da się go
// tree-shake'ować). To realnie zawiesiło ładowanie apki na produkcyjnym buildzie
// (2026-08-21) — zob. git log tego pliku. big-shoulders-display nie ma (w
// odróżnieniu od IBM Plex) osobnych folderów per-waga z własnym index.js —
// stąd dla niego require() bezpośrednio na plik .ttf niżej, z pominięciem
// index.js tego pakietu.
import { IBMPlexMono_400Regular } from '@expo-google-fonts/ibm-plex-mono/400Regular';
import { IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono/500Medium';
import { IBMPlexMono_600SemiBold } from '@expo-google-fonts/ibm-plex-mono/600SemiBold';
import { IBMPlexSans_400Regular } from '@expo-google-fonts/ibm-plex-sans/400Regular';
import { IBMPlexSans_500Medium } from '@expo-google-fonts/ibm-plex-sans/500Medium';
import { IBMPlexSans_600SemiBold } from '@expo-google-fonts/ibm-plex-sans/600SemiBold';
import { IBMPlexSans_700Bold } from '@expo-google-fonts/ibm-plex-sans/700Bold';
import { useFonts } from 'expo-font';
import { SplashScreen, Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Animated, Image, Platform, StyleSheet, View } from 'react-native';

import { ActionSheetHost } from '@/components/action-sheet-host';
import { ConfirmModalHost } from '@/components/confirm-modal-host';
import { LegalDocumentHost } from '@/components/legal-document-host';
import { LoadingDots } from '@/components/loading-dots';
import { ToastHost } from '@/components/toast-host';
import { WebAppShell } from '@/components/web-app-shell';
import { LocaleProvider, useLocale } from '@/context/locale';
import { SessionProvider, useSession } from '@/context/session';
import { primeFieldsPrefetch } from '@/lib/fields-prefetch';
import { onInitialMapDataReady } from '@/lib/map-ready';

// eslint-disable-next-line @typescript-eslint/no-var-requires -- patrz komentarz przy importach fontów u góry pliku
const BigShouldersDisplay_700Bold = require('@expo-google-fonts/big-shoulders-display/BigShouldersDisplay_700Bold.ttf');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const BigShouldersDisplay_800ExtraBold = require('@expo-google-fonts/big-shoulders-display/BigShouldersDisplay_800ExtraBold.ttf');

/** Maksymalny dodatkowy czas na starcie, żeby splash poczekał na pierwsze
 * boiska/eventy z mapy — zabezpieczenie na wypadek wolnej/zerwanej sieci,
 * żeby ekran startowy nigdy nie wisiał w nieskończoność. Zgłoszenie
 * 2026-08-16: "boiska mają być w pełni załadowane od razu na wejściu" ma
 * być egzekwowane, nie tylko preferowane — 4s było za krótkie na zimne
 * połączenie z Supabase (brak cache'u regionu, patrz fields-prefetch.ts),
 * więc splash częściej niż powinien poddawał się zanim dane realnie
 * dotarły, i mapa doładowywała boiska dopiero po wejściu. */
const MAP_READY_TIMEOUT_MS = 8000;
/** Minimalny czas, przez jaki splash (z animacją kropek — patrz LoadingDots)
 * zostaje na ekranie, nawet gdy dane są gotowe szybciej. Z ciepłym cache'em
 * boisk (fields-prefetch.ts) dane potrafią być gotowe w ułamku sekundy —
 * bez tego splash znikał, zanim kropki w ogóle zdążyły się pokazać. */
const MIN_SPLASH_VISIBLE_MS = 700;

// Web MUSI używać dokładnie tego samego URL-a co statyczny splash w
// public/index.html (public/splash-logo.png, serwowany pod /splash-logo.png
// bez haszowania nazwy) — inaczej `require(...)` każe Metro/webpackowi
// wygenerować OSOBNY, inny (hashowany) URL do assets/images/splash-logo.png,
// a przeglądarka musi go pobrać od nowa zamiast trafić w cache z pierwszego
// (statycznego) fetcha. Ten dodatkowy round-trip to dokładnie ta sekunda
// (albo więcej na wolnym łączu), w której biegacz (wektor, renderuje się od
// razu, zero sieci) już wisi na ekranie, a logo jeszcze nie — zgłoszenie
// 2026-08-16: mają się pojawiać RAZEM, nie logo z opóźnieniem. Ta sama
// nazwa pliku = gwarantowany trafiony cache = zero widocznego opóźnienia.
const LOGO = Platform.OS === 'web' ? { uri: '/splash-logo.png' } : require('../../assets/images/splash-logo.png');

SplashScreen.preventAutoHideAsync();

// Startuje najwcześniej jak się da — równolegle z resztą inicjalizacji (auth,
// nawigacja), zamiast dopiero po zamontowaniu ekranu mapy. Baza obejmuje na
// razie tylko Trójmiasto (patrz fields-prefetch.ts), więc jedno preładowanie
// tutaj wystarcza na cały pobyt w apce.
primeFieldsPrefetch();

// Po starcie aplikacja ma zawsze lądować na mapie ((app) -> "/"), a nie np. na
// ekranie regulaminu/ustawień prawnych.
export const unstable_settings = {
  initialRouteName: '(app)',
};

export default function RootLayout() {
  return (
    <LocaleProvider>
      <SessionProvider>
        <WebAppShell>
          <RootNavigator />
        </WebAppShell>
      </SessionProvider>
    </LocaleProvider>
  );
}

/**
 * Decyduje, którą część aplikacji widzi użytkownik:
 * - zalogowany → grupa (app)
 * - niezalogowany → grupa (auth)
 * Stack.Protected automatycznie przekierowuje, gdy zmieni się stan sesji.
 */
function RootNavigator() {
  const { session, isLoading, isPasswordRecovery, needsProfileSetup, needsOnboarding } = useSession();
  // Konsumujemy język tutaj, żeby cała nawigacja przerenderowała się po zmianie
  // języka. Bez tego React pomijał poddrzewo ekranów (children providera mają stałą
  // tożsamość), więc np. mapa/eventy/profil zostawały w starym języku.
  const { locale } = useLocale();

  // Big Shoulders Display (nagłówki/wyniki) + IBM Plex Sans (treść) + IBM Plex
  // Mono (tabelki/liczby) — patrz Typography w constants/ui.ts. Splash trzyma
  // się, dopóki fonty nie są gotowe, żeby tekst nie „mrugnął" systemową czcionką.
  const [fontsLoaded, fontsError] = useFonts({
    BigShouldersDisplay_700Bold,
    BigShouldersDisplay_800ExtraBold,
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexSans_700Bold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
  });
  // Błąd wczytywania fontu (np. zerwana sieć) NIE może trzymać usera na
  // splashu w nieskończoność — traktujemy go tak samo jak "gotowe", appka
  // po prostu wtedy pokaże się z systemową czcionką zastępczą (Fonts.sans).
  const fontsReady = fontsLoaded || !!fontsError;

  // Płynne wejście: własny ciemny ekran startowy (z logo) płynnie znika,
  // tak by przejście z natywnego splasha do aplikacji nie „mrugało".
  const [splashGone, setSplashGone] = useState(false);
  const splashOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isLoading || !fontsReady) return;

    let settled = false;
    let fadeTimer: ReturnType<typeof setTimeout> | null = null;
    let readyTimeout: ReturnType<typeof setTimeout> | null = null;
    let minVisibleTimer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribeMapReady: (() => void) | null = null;
    let dataReady = false;

    function startFade() {
      if (settled) return;
      settled = true;
      if (readyTimeout) clearTimeout(readyTimeout);
      if (minVisibleTimer) clearTimeout(minVisibleTimer);
      if (unsubscribeMapReady) unsubscribeMapReady();
      // React jest gotowy — chowamy natywny splash (nasz ciemny overlay już go zastępuje).
      SplashScreen.hideAsync().catch(() => {});
      fadeTimer = setTimeout(() => {
        Animated.timing(splashOpacity, {
          toValue: 0,
          duration: 480,
          useNativeDriver: true,
        }).start(() => setSplashGone(true));
      }, 180);
    }

    // Dane gotowe -> zamyka splash dopiero, gdy MIN_SPLASH_VISIBLE_MS też minął
    // (który z kolei, gdy dane są już gotowe, sam odpala startFade) — czeka na
    // PÓŹNIEJSZY z tych dwóch warunków, nie na pierwszy.
    function onDataReady() {
      dataReady = true;
      if (minVisibleTimer == null) startFade();
    }

    const willShowMap = !!session && !isPasswordRecovery && !needsProfileSetup && !needsOnboarding;
    if (willShowMap) {
      // Trzymamy splash, dopóki mapa nie skończy pierwszego ładowania boisk/eventów —
      // inaczej użytkownik przez chwilę widzi pustą mapę i myśli, że coś nie działa.
      // Limit czasu na wypadek wolnej/zerwanej sieci.
      readyTimeout = setTimeout(startFade, MAP_READY_TIMEOUT_MS);
      minVisibleTimer = setTimeout(() => {
        minVisibleTimer = null;
        if (dataReady) startFade();
      }, MIN_SPLASH_VISIBLE_MS);
      unsubscribeMapReady = onInitialMapDataReady(onDataReady);
    } else {
      startFade();
    }

    return () => {
      settled = true;
      if (fadeTimer) clearTimeout(fadeTimer);
      if (readyTimeout) clearTimeout(readyTimeout);
      if (minVisibleTimer) clearTimeout(minVisibleTimer);
      if (unsubscribeMapReady) unsubscribeMapReady();
    };
  }, [isLoading, fontsReady, session, isPasswordRecovery, needsProfileSetup, needsOnboarding, splashOpacity]);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      {/* key={locale}: zmiana języka przemontowuje cały stos nawigacji, dzięki czemu
          KAŻDY ekran (mapa, eventy, profil, ustawienia…) renderuje się od nowa w nowym
          języku — „od początku do końca", bez gubienia sesji. */}
      <Stack key={locale} screenOptions={{ headerShown: false }}>
        <Stack.Protected
          guard={!!session && !isPasswordRecovery && !needsProfileSetup && !needsOnboarding}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>

        {/* Pokazywany raz na konto, po dokończeniu profilu a przed wejściem w (app) —
            patrz src/context/session.tsx (needsOnboarding, profiles.has_completed_onboarding). */}
        <Stack.Protected
          guard={!!session && !isPasswordRecovery && !needsProfileSetup && needsOnboarding}>
          <Stack.Screen name="(onboarding)" />
        </Stack.Protected>

        <Stack.Protected guard={!session || isPasswordRecovery || needsProfileSetup}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>

      {/* Regulamin / polityka jako modal (nie trasa) — działa wszędzie, „wstecz" zamyka. */}
      <LegalDocumentHost />
      <ConfirmModalHost />
      <ActionSheetHost />
      <ToastHost />

      {!splashGone ? (
        <Animated.View
          style={[styles.splash, { opacity: splashOpacity }]}
          pointerEvents={isLoading ? 'auto' : 'none'}>
          <Image source={LOGO} style={styles.splashLogo} resizeMode="contain" />
          <View style={styles.splashDots}>
            <LoadingDots />
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  splash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashLogo: {
    width: 340,
    aspectRatio: 752 / 509,
  },
  splashDots: {
    marginTop: 28,
  },
});
