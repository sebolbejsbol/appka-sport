import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';

import { Brand, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';
import {
  registerActionSheetHost,
  type ActionSheetRequest,
} from '@/lib/action-sheet-navigation';

/**
 * Host arkusza akcji (bottom sheet) z listą opcji. Zastępuje wieloopcjowe
 * Alert.alert(title, message, [...]) (np. wybór powodu zgłoszenia) —
 * no-op na react-native-web, i niespójny wizualnie z resztą apki na
 * pozostałych platformach. Montowany wysoko w drzewie.
 */
export function ActionSheetHost() {
  const insets = useSafeAreaInsets();
  const [request, setRequest] = useState<ActionSheetRequest | null>(null);

  useEffect(() => {
    registerActionSheetHost((next) => setRequest(next));
    return () => registerActionSheetHost(null);
  }, []);

  const close = () => setRequest(null);

  function handleOptionPress(onPress: () => void) {
    close();
    onPress();
  }

  return (
    <Modal visible={request !== null} transparent animationType="fade" onRequestClose={close}>
      {request ? (
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} />
          <Animated.View
            entering={SlideInDown.springify().damping(22).stiffness(260)}
            exiting={SlideOutDown.duration(180)}
            style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.header}>
              <Text style={styles.title}>{request.title}</Text>
              {request.message ? <Text style={styles.message}>{request.message}</Text> : null}
            </View>

            {request.options.map((option, index) => (
              <Pressable
                key={index}
                onPress={() => handleOptionPress(option.onPress)}
                style={({ pressed }) => [
                  styles.option,
                  index === request.options.length - 1 && styles.optionLast,
                  pressed && styles.optionPressed,
                ]}>
                <Text style={[styles.optionText, option.destructive && styles.optionTextDanger]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}

            <Pressable
              onPress={close}
              style={({ pressed }) => [styles.cancelBtn, pressed && styles.optionPressed]}>
              <Text style={styles.cancelText}>{request.cancelLabel}</Text>
            </Pressable>
          </Animated.View>
        </View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Brand.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Brand.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingTop: 8,
    paddingHorizontal: 16,
    ...shadow('lg'),
  },
  header: {
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: Brand.border,
    marginBottom: 4,
  },
  title: { fontSize: 15, fontWeight: '700', color: Brand.textPrimary, textAlign: 'center' },
  message: { fontSize: 13, color: Brand.textMuted, textAlign: 'center', marginTop: 4 },
  option: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Brand.border,
  },
  optionLast: { borderBottomWidth: 0 },
  optionPressed: { opacity: 0.6 },
  optionText: { fontSize: 16, fontWeight: '600', color: Brand.primary, textAlign: 'center' },
  optionTextDanger: { color: Brand.danger },
  cancelBtn: {
    marginTop: 8,
    paddingVertical: 16,
    borderRadius: Radius.md,
    backgroundColor: Brand.surfaceMuted,
  },
  cancelText: { fontSize: 16, fontWeight: '700', color: Brand.textPrimary, textAlign: 'center' },
});
