import { SplashScreen, Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Animated,
  Image,
  StyleSheet,
  View,
} from 'react-native';

import { LegalDocumentHost } from '@/components/legal-document-host';
import { WebAppShell } from '@/components/web-app-shell';
import { Brand } from '@/constants/theme';
import { LocaleProvider, useLocale } from '@/context/locale';
import { SessionProvider, useSession } from '@/context/session';

const LOGO = require('../../assets/images/splash-logo.png');

SplashScreen.preventAutoHideAsync();

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
    // React jest gotowy — chowamy natywny splash (nasz ciemny overlay już go zastępuje).
    SplashScreen.hideAsync().catch(() => {});
    const id = setTimeout(() => {
      Animated.timing(splashOpacity, {
        toValue: 0,
        duration: 480,
        useNativeDriver: true,
      }).start(() => setSplashGone(true));
    }, 180);
    return () => clearTimeout(id);
  }, [isLoading, splashOpacity]);

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

      {!splashGone ? (
        <Animated.View
          style={[styles.splash, { opacity: splashOpacity }]}
          pointerEvents={isLoading ? 'auto' : 'none'}>
          <Image source={LOGO} style={styles.splashLogo} resizeMode="contain" />
          <ActivityIndicator color={Brand.primary} style={styles.splashSpinner} />
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
  splashSpinner: {
    marginTop: 28,
  },
});
