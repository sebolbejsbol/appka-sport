import { SplashScreen, Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Animated, Image, StyleSheet, View } from 'react-native';

import { ActionSheetHost } from '@/components/action-sheet-host';
import { ConfirmModalHost } from '@/components/confirm-modal-host';
import { LegalDocumentHost } from '@/components/legal-document-host';
import { LoadingRunner } from '@/components/loading-runner';
import { ToastHost } from '@/components/toast-host';
import { WebAppShell } from '@/components/web-app-shell';
import { LocaleProvider, useLocale } from '@/context/locale';
import { SessionProvider, useSession } from '@/context/session';
import { primeFieldsPrefetch } from '@/lib/fields-prefetch';
import { onInitialMapDataReady } from '@/lib/map-ready';

/** Maksymalny dodatkowy czas na starcie, żeby splash poczekał na pierwsze
 * boiska/eventy z mapy — zabezpieczenie na wypadek wolnej/zerwanej sieci,
 * żeby ekran startowy nigdy nie wisiał w nieskończoność. */
const MAP_READY_TIMEOUT_MS = 4000;
/** Minimalny czas, przez jaki splash (z animacją biegacza — patrz LoadingRunner)
 * zostaje na ekranie, nawet gdy dane są gotowe szybciej. Z ciepłym cache'em
 * boisk (fields-prefetch.ts) dane potrafią być gotowe w ułamku sekundy —
 * bez tego splash znikał, zanim biegacz w ogóle zdążył się pokazać. */
const MIN_SPLASH_VISIBLE_MS = 700;

const LOGO = require('../../assets/images/splash-logo.png');

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
  const { session, isLoading, isPasswordRecovery, needsProfileSetup } = useSession();
  // Konsumujemy język tutaj, żeby cała nawigacja przerenderowała się po zmianie
  // języka. Bez tego React pomijał poddrzewo ekranów (children providera mają stałą
  // tożsamość), więc np. mapa/eventy/profil zostawały w starym języku.
  const { locale } = useLocale();

  // Płynne wejście: własny ciemny ekran startowy (z logo) płynnie znika,
  // tak by przejście z natywnego splasha do aplikacji nie „mrugało".
  const [splashGone, setSplashGone] = useState(false);
  const splashOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isLoading) return;

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

    const willShowMap = !!session && !isPasswordRecovery && !needsProfileSetup;
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
  }, [isLoading, session, isPasswordRecovery, needsProfileSetup, splashOpacity]);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      {/* key={locale}: zmiana języka przemontowuje cały stos nawigacji, dzięki czemu
          KAŻDY ekran (mapa, eventy, profil, ustawienia…) renderuje się od nowa w nowym
          języku — „od początku do końca", bez gubienia sesji. */}
      <Stack key={locale} screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!!session && !isPasswordRecovery && !needsProfileSetup}>
          <Stack.Screen name="(app)" />
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
          <View style={styles.splashRunner}>
            <LoadingRunner size={44} />
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
    width: 280,
    aspectRatio: 752 / 509,
  },
  splashRunner: {
    marginTop: 28,
  },
});
