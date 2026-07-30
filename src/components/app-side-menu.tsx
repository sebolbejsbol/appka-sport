import { router, usePathname, type Href } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brand, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';
import { useLocale } from '@/context/locale';
import { useIsAdmin } from '@/hooks/use-is-admin';
import { t } from '@/i18n';

const DRAWER_WIDTH = 288;

const HIDDEN_EXACT = ['/event/new', '/event/edit'];
const HIDDEN_PREFIXES = ['/field'];
/** Podstrony admina (np. weryfikacja) — własny wstecz, bez hamburgera. */
const MENU_HIDDEN_EXACT = ['/social/search', '/social/friends', '/profile/edit', '/teams/create'];
const MENU_HIDDEN_PREFIXES = ['/user/', '/messages/', '/admin/', '/teams/', '/feed/post/'];

type NavItem = {
  key: string;
  label: string;
  path: Href;
  icon: string;
  hint?: string;
};

/**
 * Najważniejsze rzeczy do zrobienia eventu są na wierzchu (mapa, eventy, profil).
 * Reszta społeczności chowa się pod „Zaawansowane", żeby nowy użytkownik w kilku
 * kliknięciach znalazł boisko i ludzi do gry.
 */
function buildPrimaryItems(): NavItem[] {
  return [
    { key: 'events', label: t('nav.events'), path: '/events', icon: '🎉', hint: t('nav.eventsHint') },
    { key: 'map', label: t('nav.map'), path: '/', icon: '🗺️', hint: t('nav.mapHint') },
    { key: 'profile', label: t('nav.profile'), path: '/profile', icon: '👤', hint: t('nav.profileHint') },
  ];
}

function buildAdvancedItems(): NavItem[] {
  return [
    { key: 'feed', label: t('nav.feed'), path: '/feed' as Href, icon: '📣', hint: t('nav.feedHint') },
    { key: 'ranking', label: t('nav.ranking'), path: '/ranking' as Href, icon: '🏆', hint: t('nav.rankingHint') },
    { key: 'teams', label: t('nav.teams'), path: '/teams' as Href, icon: '🛡️', hint: t('nav.teamsHint') },
    { key: 'friends', label: t('nav.friends'), path: '/social', icon: '🤝' },
    { key: 'messages', label: t('nav.messages'), path: '/messages' as Href, icon: '💬' },
  ];
}

const ADVANCED_PATHS = ['/feed', '/ranking', '/teams', '/social', '/messages'];

type AppMenuContextValue = {
  open: boolean;
  openMenu: () => void;
  closeMenu: () => void;
};

const AppMenuContext = createContext<AppMenuContextValue | null>(null);

function useAppMenu(): AppMenuContextValue {
  const value = useContext(AppMenuContext);
  if (!value) {
    throw new Error('useAppMenu musi być użyte wewnątrz <AppMenuProvider />');
  }
  return value;
}

function isMenuVisibleRoute(pathname: string): boolean {
  if (HIDDEN_EXACT.includes(pathname)) return false;
  if (HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return false;
  if (MENU_HIDDEN_EXACT.includes(pathname)) return false;
  if (MENU_HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return false;
  if (pathname.startsWith('/event/')) return true;
  return (
    pathname === '/' ||
    pathname === '/events' ||
    pathname === '/ranking' ||
    pathname === '/feed' ||
    pathname === '/teams' ||
    pathname === '/profile' ||
    pathname === '/settings' ||
    pathname === '/social' ||
    pathname === '/messages' ||
    pathname === '/admin'
  );
}

function isNavActive(pathname: string, path: Href): boolean {
  return pathname === path;
}

export function AppMenuProvider({ children }: PropsWithChildren) {
  const [open, setOpen] = useState(false);

  const value = useMemo(
    () => ({
      open,
      openMenu: () => setOpen(true),
      closeMenu: () => setOpen(false),
    }),
    [open],
  );

  return (
    <AppMenuContext.Provider value={value}>
      {children}
      <AppDrawer />
      <AppMenuButton />
    </AppMenuContext.Provider>
  );
}

function AppDrawer() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { open, closeMenu } = useAppMenu();
  const { isAdmin } = useIsAdmin();
  // Subskrypcja języka — bez tego etykiety menu nie zmieniałyby się po zmianie
  // języka (były liczone raz przy imporcie modułu).
  const { locale } = useLocale();
  const translateX = useSharedValue(-DRAWER_WIDTH);
  const backdropOpacity = useSharedValue(0);

  const primaryItems = useMemo(() => buildPrimaryItems(), [locale]);
  const advancedItems = useMemo(() => buildAdvancedItems(), [locale]);
  const onAdvancedRoute = ADVANCED_PATHS.includes(pathname);
  const [advancedOpen, setAdvancedOpen] = useState(onAdvancedRoute);

  // Gdy jesteśmy na ekranie z sekcji zaawansowanej, rozwiń ją po otwarciu menu.
  useEffect(() => {
    if (open && onAdvancedRoute) setAdvancedOpen(true);
  }, [open, onAdvancedRoute]);

  useEffect(() => {
    translateX.value = withTiming(open ? 0 : -DRAWER_WIDTH, {
      duration: 240,
      easing: Easing.out(Easing.cubic),
    });
    backdropOpacity.value = withTiming(open ? 1 : 0, { duration: 200 });
  }, [open, backdropOpacity, translateX]);

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const navigate = useCallback(
    (path: Href) => {
      closeMenu();
      if (pathname === path) return;
      router.replace(path);
    },
    [closeMenu, pathname],
  );

  if (!open) return null;

  return (
    <Modal
      transparent
      visible={open}
      animationType="none"
      onRequestClose={closeMenu}
      statusBarTranslucent>
      <View style={styles.root} pointerEvents="box-none">
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable style={styles.backdropPress} onPress={closeMenu} />
        </Animated.View>

        <Animated.View
          style={[
            styles.panel,
            panelStyle,
            {
              paddingTop: insets.top + 20,
              paddingBottom: insets.bottom + 16,
            },
          ]}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>{t('nav.menu')}</Text>
            <Pressable
              onPress={closeMenu}
              hitSlop={12}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.panelBody}
            contentContainerStyle={styles.panelScroll}
            showsVerticalScrollIndicator={false}>
            <View style={styles.navList}>
              <View style={styles.navSection}>
                <Text style={styles.navSectionTitle}>{t('nav.sectionDiscover')}</Text>
                {primaryItems.map((item) => (
                  <NavRow
                    key={item.key}
                    item={item}
                    active={isNavActive(pathname, item.path)}
                    onPress={() => navigate(item.path)}
                  />
                ))}
              </View>

              <View style={styles.navSection}>
                <Pressable
                  onPress={() => setAdvancedOpen((value) => !value)}
                  style={({ pressed }) => [
                    styles.advancedToggle,
                    pressed && styles.navItemPressed,
                  ]}>
                  <View style={styles.advancedToggleMain}>
                    <Text style={styles.navSectionTitle}>{t('nav.advanced')}</Text>
                    <Text style={styles.advancedHint}>{t('nav.advancedHint')}</Text>
                  </View>
                  <Text style={styles.advancedChevron}>{advancedOpen ? '▾' : '▸'}</Text>
                </Pressable>

                {advancedOpen
                  ? advancedItems.map((item) => (
                      <NavRow
                        key={item.key}
                        item={item}
                        active={isNavActive(pathname, item.path)}
                        onPress={() => navigate(item.path)}
                      />
                    ))
                  : null}
              </View>
            </View>
          </ScrollView>

            <View style={styles.footer}>
              {isAdmin ? (
                <Pressable
                  onPress={() => navigate('/admin' as Href)}
                  style={({ pressed }) => [
                    styles.settingsItem,
                    isNavActive(pathname, '/admin' as Href) && styles.settingsItemActive,
                    pressed && styles.navItemPressed,
                  ]}>
                  <Text style={styles.settingsIcon}>🛡</Text>
                  <View style={styles.navItemMain}>
                    <Text
                      style={[
                        styles.settingsLabel,
                        isNavActive(pathname, '/admin' as Href) && styles.navItemLabelActive,
                      ]}>
                      {t('nav.admin')}
                    </Text>
                    <Text style={styles.navItemHint}>{t('nav.adminHint')}</Text>
                  </View>
                  <Text style={styles.navItemChevron}>›</Text>
                </Pressable>
              ) : null}

              <Pressable
                onPress={() => navigate('/settings')}
                style={({ pressed }) => [
                  styles.settingsItem,
                  isNavActive(pathname, '/settings') && styles.settingsItemActive,
                  pressed && styles.navItemPressed,
                ]}>
                <Text style={styles.settingsIcon}>⚙</Text>
                <View style={styles.navItemMain}>
                  <Text
                    style={[
                      styles.settingsLabel,
                      isNavActive(pathname, '/settings') && styles.navItemLabelActive,
                    ]}>
                    {t('nav.settings')}
                  </Text>
                  <Text style={styles.navItemHint}>{t('nav.settingsHint')}</Text>
                </View>
                <Text style={styles.navItemChevron}>›</Text>
              </Pressable>
            </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function NavRow({
  item,
  active,
  onPress,
}: {
  item: NavItem;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.navItem,
        active && styles.navItemActive,
        pressed && styles.navItemPressed,
      ]}>
      <View style={[styles.navIconWrap, active && styles.navIconWrapActive]}>
        <Text style={styles.navIcon}>{item.icon}</Text>
      </View>
      <View style={styles.navItemMain}>
        <Text style={[styles.navItemLabel, active && styles.navItemLabelActive]}>{item.label}</Text>
        {item.hint ? <Text style={styles.navItemHint}>{item.hint}</Text> : null}
      </View>
      <Text style={styles.navItemChevron}>›</Text>
    </Pressable>
  );
}

function AppMenuButton() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { openMenu } = useAppMenu();

  if (!isMenuVisibleRoute(pathname)) return null;

  return (
    <Pressable
      onPress={openMenu}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={t('nav.openMenu')}
      style={({ pressed }) => [
        styles.menuButton,
        { top: insets.top + 12 },
        pressed && styles.pressed,
      ]}>
      <View style={styles.menuIcon}>
        <View style={styles.menuLine} />
        <View style={styles.menuLine} />
        <View style={styles.menuLine} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: Brand.overlay,
  },
  backdropPress: {
    flex: 1,
  },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: DRAWER_WIDTH,
    backgroundColor: Brand.surface,
    borderRightWidth: 1,
    borderRightColor: Brand.border,
    paddingHorizontal: 20,
    ...shadow('lg'),
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  panelTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: Brand.textPrimary,
  },
  panelBody: {
    flex: 1,
  },
  panelScroll: {
    paddingBottom: 8,
  },
  navList: {
    gap: 4,
  },
  navSection: {
    marginBottom: 14,
    gap: 6,
  },
  navSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: Brand.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginLeft: 4,
  },
  advancedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginBottom: 2,
  },
  advancedToggleMain: {
    flex: 1,
    paddingRight: 8,
  },
  advancedHint: {
    fontSize: 12,
    color: Brand.textMuted,
    marginTop: -4,
  },
  advancedChevron: {
    fontSize: 16,
    color: Brand.textMuted,
    fontWeight: '700',
  },
  navIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.screenBackground,
    marginRight: 12,
  },
  navIconWrapActive: {
    backgroundColor: Brand.surface,
  },
  navIcon: {
    fontSize: 18,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surfaceMuted,
  },
  navItemActive: {
    borderColor: Brand.primary,
    backgroundColor: Brand.primaryLight,
  },
  navItemPressed: {
    opacity: 0.85,
  },
  navItemMain: {
    flex: 1,
    paddingRight: 8,
  },
  navItemLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: Brand.textPrimary,
  },
  navItemLabelActive: {
    color: Brand.primary,
  },
  navItemHint: {
    fontSize: 13,
    color: Brand.textMuted,
    marginTop: 2,
  },
  navItemChevron: {
    fontSize: 22,
    color: Brand.textMuted,
    fontWeight: '300',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: Brand.border,
    paddingTop: 16,
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surfaceMuted,
    marginBottom: 8,
  },
  settingsItemActive: {
    borderColor: Brand.primary,
    backgroundColor: Brand.primaryLight,
  },
  settingsIcon: {
    fontSize: 20,
    marginRight: 10,
    color: Brand.textPrimary,
  },
  settingsLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: Brand.textPrimary,
  },
  menuButton: {
    position: 'absolute',
    left: 16,
    zIndex: 30,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow('float'),
  },
  menuIcon: {
    width: 18,
    gap: 4,
  },
  menuLine: {
    height: 2,
    borderRadius: 1,
    backgroundColor: Brand.textPrimary,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.screenBackground,
  },
  closeText: {
    fontSize: 16,
    color: Brand.textSecondary,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.8,
  },
});
