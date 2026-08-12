import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeInDown,
  FadeOutUp,
  Layout as ReanimatedLayout,
} from 'react-native-reanimated';

import { Brand, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';
import { registerToastHost, type ToastRequest, type ToastVariant } from '@/lib/toast-navigation';

const AUTO_DISMISS_MS = 3000;
let nextId = 1;

function variantStyle(variant: ToastVariant) {
  switch (variant) {
    case 'success':
      return { bg: Brand.success, icon: '✓' };
    case 'error':
      return { bg: Brand.danger, icon: '!' };
    default:
      return { bg: Brand.ink, icon: '' };
  }
}

/**
 * Host krótkich powiadomień (toast). Zastępuje pojedyncze Alert.alert(message)
 * — na react-native-web Alert.alert to no-op, a poza tym toast lepiej pasuje
 * do stylu potwierdzeń z reszty apki. Montowany wysoko w drzewie.
 */
export function ToastHost() {
  const insets = useSafeAreaInsets();
  const [toasts, setToasts] = useState<ToastRequest[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    registerToastHost((request) => {
      const id = nextId++;
      setToasts((prev) => [...prev, { ...request, id }]);
      const timer = setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
        timers.current.delete(id);
      }, AUTO_DISMISS_MS);
      timers.current.set(id, timer);
    });
    const timersSnapshot = timers.current;
    return () => {
      registerToastHost(null);
      timersSnapshot.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + 12 }]}>
      {toasts.map((toast) => {
        const { bg, icon } = variantStyle(toast.variant);
        return (
          <Animated.View
            key={toast.id}
            entering={FadeInDown.springify().damping(18).stiffness(220)}
            exiting={FadeOutUp.duration(180)}
            layout={ReanimatedLayout.springify()}
            style={[styles.toast, { backgroundColor: bg }]}>
            {icon ? <Text style={styles.icon}>{icon}</Text> : null}
            <Text style={styles.message}>{toast.message}</Text>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
    gap: 8,
    zIndex: 1000,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: 480,
    width: '100%',
    borderRadius: Radius.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
    ...shadow('lg'),
  },
  icon: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  message: {
    flex: 1,
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
