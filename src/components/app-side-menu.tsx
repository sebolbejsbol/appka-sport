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
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DESKTOP_NAV_BREAKPOINT } from '@/components/web-app-shell';
import { Brand, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';
import { useLocale } from '@/context/locale';
import { useIsAdmin } from '@/hooks/use-is-admin';
import { t } from '@/i18n';
import { formatRelativeShortTime } from '@/lib/datetime';
import {
  getUnreadNotificationCount,
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationDisplayText,
  subscribeToMyNotifications,
  type AppNotification,
} from '@/lib/notifications';
import { notifyError, notifyInfo } from '@/lib/toast';

const DRAWER_WIDTH = 288;
const SIDEBAR_WIDTH = 264;

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
  badge?: number;
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
  const { width } = useWindowDimensions();
  const isDesktopNav = Platform.OS === 'web' && width >= DESKTOP_NAV_BREAKPOINT;

  const value = useMemo(
    () => ({
      open,
      openMenu: () => setOpen(true),
      closeMenu: () => setOpen(false),
    }),
    [open],
  );

  if (isDesktopNav) {
    return (
      <AppMenuContext.Provider value={value}>
        <View style={styles.desktopRoot}>
          <DesktopSidebar />
          <View style={styles.desktopContent}>{children}</View>
        </View>
      </AppMenuContext.Provider>
    );
  }

  return (
    <AppMenuContext.Provider value={value}>
      {children}
      <AppDrawer />
      <AppMenuButton />
    </AppMenuContext.Provider>
  );
}

/** Stały pasek boczny dla szerokich ekranów — zastępuje hamburger + wysuwany drawer. */
function DesktopSidebar() {
  const pathname = usePathname();
  const { isAdmin } = useIsAdmin();
  const { locale } = useLocale();
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const primaryItems = useMemo(() => buildPrimaryItems(), [locale]);
  const advancedItems = useMemo(() => buildAdvancedItems(), [locale]);

  useEffect(() => {
    void getUnreadNotificationCount().then(setUnreadNotifications);
    const unsubscribe = subscribeToMyNotifications((n) => {
      setUnreadNotifications((prev) => prev + 1);
      const { title, body } = notificationDisplayText(n, t);
      notifyInfo(body ? `${title} — ${body}` : title);
    });
    return unsubscribe;
  }, []);

  const navigate = useCallback(
    (path: Href) => {
      if (pathname === path) return;
      router.replace(path);
    },
    [pathname],
  );

  // Subskrypcja powiadomień wyżej zostaje żywa niezależnie od trasy (stąd
  // wcześniejszy return, a nie warunkowy montaż całego komponentu) — inaczej
  // badge/toast przestawałby działać na ekranach pełnoekranowych (czat,
  // admin, drużyny…), gdzie chowamy tylko widoczny pasek.
  if (!isMenuVisibleRoute(pathname)) return null;

  return (
    <View style={styles.sidebar}>
      <View style={styles.sidebarHeader}>
        <Text style={styles.sidebarBrand}>{t('nav.menu')}</Text>
        <NotificationsBell unreadCount={unreadNotifications} onUnreadCountChange={setUnreadNotifications} />
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
            <Text style={styles.navSectionTitle}>{t('nav.advanced')}</Text>
            {advancedItems.map((item) => (
              <NavRow
                key={item.key}
                item={item}
                active={isNavActive(pathname, item.path)}
                onPress={() => navigate(item.path)}
              />
            ))}
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
    </View>
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

  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const primaryItems = useMemo(() => buildPrimaryItems(), [locale]);
  const advancedItems = useMemo(() => buildAdvancedItems(), [locale]);
  const onAdvancedRoute = ADVANCED_PATHS.includes(pathname);
  const [advancedOpen, setAdvancedOpen] = useState(onAdvancedRoute);

  // Gdy jesteśmy na ekranie z sekcji zaawansowanej, rozwiń ją po otwarciu menu.
  useEffect(() => {
    if (open && onAdvancedRoute) setAdvancedOpen(true);
  }, [open, onAdvancedRoute]);

  useEffect(() => {
    if (!open) return;
    void getUnreadNotificationCount().then(setUnreadNotifications);
  }, [open, pathname]);

  // AppDrawer jest zamontowany przez cały czas życia aplikacji (nie tylko gdy
  // menu jest otwarte), więc to dobre miejsce na globalną subskrypcję —
  // dzięki niej badge aktualizuje się na żywo niezależnie od tego, na jakim
  // ekranie jest użytkownik, bez konieczności otwierania menu.
  useEffect(() => {
    void getUnreadNotificationCount().then(setUnreadNotifications);
    const unsubscribe = subscribeToMyNotifications((n) => {
      setUnreadNotifications((prev) => prev + 1);
      const { title, body } = notificationDisplayText(n, t);
      notifyInfo(body ? `${title} — ${body}` : title);
    });
    return unsubscribe;
  }, []);

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
            <View style={styles.panelHeaderActions}>
              <NotificationsBell
                unreadCount={unreadNotifications}
                onUnreadCountChange={setUnreadNotifications}
                onBeforeOpen={closeMenu}
              />
              <Pressable
                onPress={closeMenu}
                hitSlop={12}
                style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
                <Text style={styles.closeText}>✕</Text>
              </Pressable>
            </View>
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
        {item.badge ? (
          <Animated.View key={item.badge} entering={ZoomIn.springify().damping(10).stiffness(300)} style={styles.navBadge}>
            <Text style={styles.navBadgeText}>{item.badge > 9 ? '9+' : item.badge}</Text>
          </Animated.View>
        ) : null}
      </View>
      <View style={styles.navItemMain}>
        <Text style={[styles.navItemLabel, active && styles.navItemLabelActive]}>{item.label}</Text>
        {item.hint ? <Text style={styles.navItemHint}>{item.hint}</Text> : null}
      </View>
      <Text style={styles.navItemChevron}>›</Text>
    </Pressable>
  );
}

/**
 * Zamiast osobnej zakładki/trasy — dzwoneczek w miejscu dawnej pozycji menu
 * "Powiadomienia", otwierający listę jako panel nad aplikacją. Licznik
 * nieprzeczytanych i subskrypcja realtime żyją w komponencie-rodzicu
 * (DesktopSidebar/AppDrawer, patrz komentarz przy subskrypcji tam) — ten
 * komponent dostaje je jako propsy i zarządza tylko stanem panelu/listy.
 */
function NotificationsBell({
  unreadCount,
  onUnreadCountChange,
  onBeforeOpen,
}: {
  unreadCount: number;
  onUnreadCountChange: (updater: (prev: number) => number) => void;
  onBeforeOpen?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [panelOpen, setPanelOpen] = useState(false);
  const [rows, setRows] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const openPanel = useCallback(async () => {
    onBeforeOpen?.();
    setPanelOpen(true);
    setLoading(true);
    setLoadError(false);
    const { data, error } = await listMyNotifications();
    setRows(data);
    setLoadError(Boolean(error));
    setLoading(false);
  }, [onBeforeOpen]);

  const closePanel = useCallback(() => setPanelOpen(false), []);

  async function handleItemPress(item: AppNotification) {
    if (!item.read_at) {
      setRows((prev) =>
        prev.map((row) => (row.id === item.id ? { ...row, read_at: new Date().toISOString() } : row)),
      );
      onUnreadCountChange((prev) => Math.max(0, prev - 1));
      void markNotificationRead(item.id);
    }
    closePanel();

    const eventId = item.data.event_id;
    if (typeof eventId === 'string' && eventId) {
      router.push({ pathname: '/event/[id]', params: { id: eventId } });
      return;
    }
    const teamId = item.data.team_id;
    if (typeof teamId === 'string' && teamId) {
      router.push(
        (item.type === 'team_message' ? `/teams/${teamId}/chat` : `/teams/${teamId}`) as Href,
      );
      return;
    }
    const conversationId = item.data.conversation_id;
    if (typeof conversationId === 'string' && conversationId) {
      router.push({ pathname: '/messages/[id]', params: { id: conversationId } });
      return;
    }
    const postId = item.data.post_id;
    if (typeof postId === 'string' && postId) {
      router.push({ pathname: '/feed/post/[id]', params: { id: postId } });
      return;
    }
    if (item.type === 'friend_request' || item.type === 'friend_request_accepted') {
      router.push('/social/friends');
    }
  }

  async function handleMarkAllRead() {
    setRows((prev) => prev.map((row) => ({ ...row, read_at: row.read_at ?? new Date().toISOString() })));
    onUnreadCountChange(() => 0);
    const ok = await markAllNotificationsRead();
    if (!ok) notifyError(t('notifications.loadError'));
  }

  const hasUnread = rows.some((row) => !row.read_at);

  return (
    <>
      <Pressable
        onPress={() => void openPanel()}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={t('nav.notifications')}
        style={({ pressed }) => [bellStyles.trigger, pressed && styles.pressed]}>
        <Text style={bellStyles.triggerIcon}>🔔</Text>
        {unreadCount ? (
          <Animated.View
            key={unreadCount}
            entering={ZoomIn.springify().damping(10).stiffness(300)}
            style={styles.navBadge}>
            <Text style={styles.navBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
          </Animated.View>
        ) : null}
      </Pressable>

      <Modal transparent visible={panelOpen} animationType="fade" onRequestClose={closePanel} statusBarTranslucent>
        <View style={bellStyles.root} pointerEvents="box-none">
          <Pressable style={bellStyles.backdrop} onPress={closePanel} />
          <View style={[bellStyles.panel, { marginTop: insets.top + 60 }]}>
            <View style={bellStyles.panelHeader}>
              <Text style={bellStyles.panelTitle}>{t('notifications.title')}</Text>
              <View style={bellStyles.headerActions}>
                {hasUnread ? (
                  <Pressable
                    onPress={() => void handleMarkAllRead()}
                    hitSlop={8}
                    accessibilityLabel={t('notifications.markAllRead')}
                    style={bellStyles.headerAction}>
                    <Text style={bellStyles.headerActionText}>✓</Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={closePanel} hitSlop={8} style={bellStyles.headerAction}>
                  <Text style={bellStyles.headerActionText}>✕</Text>
                </Pressable>
              </View>
            </View>
            {loading ? (
              <ActivityIndicator color={Brand.primary} style={bellStyles.loader} />
            ) : loadError ? (
              <Text style={bellStyles.empty}>{t('notifications.loadError')}</Text>
            ) : rows.length === 0 ? (
              <Text style={bellStyles.empty}>{t('notifications.empty')}</Text>
            ) : (
              <FlatList
                data={rows}
                keyExtractor={(item) => item.id}
                style={bellStyles.list}
                renderItem={({ item }) => {
                  const { title, body } = notificationDisplayText(item, t);
                  const unread = !item.read_at;
                  return (
                    <Pressable
                      onPress={() => void handleItemPress(item)}
                      style={({ pressed }) => [
                        bellStyles.row,
                        unread && bellStyles.rowUnread,
                        pressed && styles.pressed,
                      ]}>
                      {unread ? <View style={bellStyles.dot} /> : <View style={bellStyles.dotSpacer} />}
                      <View style={styles.navItemMain}>
                        <Text style={bellStyles.rowTitle} numberOfLines={1}>
                          {title}
                        </Text>
                        {body ? (
                          <Text style={bellStyles.rowBody} numberOfLines={2}>
                            {body}
                          </Text>
                        ) : null}
                        <Text style={bellStyles.rowTime}>{formatRelativeShortTime(item.created_at)}</Text>
                      </View>
                    </Pressable>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>
    </>
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
  desktopRoot: {
    flex: 1,
    flexDirection: 'row',
  },
  desktopContent: {
    flex: 1,
    minWidth: 0,
  },
  sidebar: {
    width: SIDEBAR_WIDTH,
    backgroundColor: Brand.surface,
    borderRightWidth: 1,
    borderRightColor: Brand.border,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sidebarBrand: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: Brand.textPrimary,
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
  panelHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
    position: 'relative',
  },
  navIconWrapActive: {
    backgroundColor: Brand.surface,
  },
  navIcon: {
    fontSize: 18,
  },
  navBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: Brand.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Brand.surface,
  },
  navBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#ffffff',
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

const bellStyles = StyleSheet.create({
  trigger: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.screenBackground,
    position: 'relative',
  },
  triggerIcon: {
    fontSize: 18,
  },
  root: {
    flex: 1,
    alignItems: 'center',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: Brand.overlay,
  },
  panel: {
    width: '92%',
    maxWidth: 380,
    maxHeight: 480,
    backgroundColor: Brand.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Brand.border,
    overflow: 'hidden',
    ...shadow('lg'),
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Brand.border,
  },
  panelTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Brand.textPrimary,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerAction: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.screenBackground,
  },
  headerActionText: {
    fontSize: 14,
    color: Brand.textSecondary,
    fontWeight: '700',
  },
  loader: {
    marginVertical: 32,
  },
  empty: {
    color: Brand.textMuted,
    textAlign: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
    fontSize: 14,
  },
  list: {
    maxHeight: 420,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Brand.border,
  },
  rowUnread: {
    backgroundColor: Brand.primaryLight,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Brand.primary,
    marginTop: 6,
  },
  dotSpacer: {
    width: 8,
    height: 8,
    marginTop: 6,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Brand.textPrimary,
  },
  rowBody: {
    fontSize: 12,
    color: Brand.textSecondary,
  },
  rowTime: {
    fontSize: 11,
    color: Brand.textMuted,
    marginTop: 2,
  },
});
