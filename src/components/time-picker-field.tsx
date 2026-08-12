import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';

import { Button } from '@/components/button';
import { Brand, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';
import { t } from '@/i18n';

const ITEM_HEIGHT = 44;
const VISIBLE_ROWS = 5;
const PAD_ROWS = Math.floor(VISIBLE_ROWS / 2);

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function WheelColumn({
  values,
  selected,
  onSelect,
}: {
  values: number[];
  selected: number;
  onSelect: (value: number) => void;
}) {
  const listRef = useRef<FlatList<number>>(null);
  const initialIndex = Math.max(0, values.indexOf(selected));

  useEffect(() => {
    const index = Math.max(0, values.indexOf(selected));
    listRef.current?.scrollToOffset({ offset: index * ITEM_HEIGHT, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleMomentumEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const index = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    const clamped = Math.min(Math.max(index, 0), values.length - 1);
    listRef.current?.scrollToOffset({ offset: clamped * ITEM_HEIGHT, animated: true });
    onSelect(values[clamped]);
  }

  return (
    <View style={styles.wheelWrap}>
      <View pointerEvents="none" style={styles.wheelHighlight} />
      <FlatList
        ref={listRef}
        data={values}
        keyExtractor={(v) => String(v)}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        initialScrollIndex={initialIndex}
        getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
        contentContainerStyle={{ paddingVertical: ITEM_HEIGHT * PAD_ROWS }}
        onMomentumScrollEnd={handleMomentumEnd}
        style={{ height: ITEM_HEIGHT * VISIBLE_ROWS }}
        renderItem={({ item }) => {
          const active = item === selected;
          return (
            <Pressable
              style={styles.wheelItem}
              onPress={() => {
                const index = values.indexOf(item);
                listRef.current?.scrollToOffset({ offset: index * ITEM_HEIGHT, animated: true });
                onSelect(item);
              }}>
              <Text style={[styles.wheelItemText, active && styles.wheelItemTextActive]}>{pad2(item)}</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

type Props = {
  label: string;
  required?: boolean;
  /** "HH:MM" albo pusty string. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

/**
 * Zastępuje ręczne wpisywanie godziny (pole tekstowe "HH:MM") kółkiem
 * wyboru godzina/minuta w arkuszu modalnym — szybciej i bez błędów formatu.
 * Minuty w krokach 5-minutowych (wystarczające dla umawiania meczów).
 */
export function TimePickerField({ label, required, value, onChange, placeholder, disabled }: Props) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [draftHour, setDraftHour] = useState(0);
  const [draftMinute, setDraftMinute] = useState(0);

  function openPicker() {
    if (disabled) return;
    const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
    if (match) {
      setDraftHour(Math.min(23, Number(match[1])));
      const m = Number(match[2]);
      setDraftMinute(MINUTES.reduce((closest, cur) => (Math.abs(cur - m) < Math.abs(closest - m) ? cur : closest), 0));
    } else {
      setDraftHour(new Date().getHours());
      setDraftMinute(0);
    }
    setOpen(true);
  }

  function confirm() {
    onChange(`${pad2(draftHour)}:${pad2(draftMinute)}`);
    setOpen(false);
  }

  return (
    <>
      <Pressable style={[styles.fieldBtn, disabled && styles.fieldBtnDisabled]} onPress={openPicker}>
        <Text style={[styles.fieldValue, !value && styles.fieldPlaceholder]}>
          {value || placeholder || t('timePicker.select')}
        </Text>
        <Text style={styles.fieldIcon}>🕐</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <Animated.View
            entering={SlideInDown.springify().damping(22).stiffness(260)}
            exiting={SlideOutDown.duration(180)}
            style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.sheetTitle}>
              {label}
              {required ? ' *' : ''}
            </Text>

            <View style={styles.wheelsRow}>
              <WheelColumn values={HOURS} selected={draftHour} onSelect={setDraftHour} />
              <Text style={styles.wheelSeparator}>:</Text>
              <WheelColumn values={MINUTES} selected={draftMinute} onSelect={setDraftMinute} />
            </View>

            <View style={styles.sheetActions}>
              <Button label={t('common.cancel')} variant="secondary" onPress={() => setOpen(false)} style={styles.sheetBtn} />
              <Button label={t('timePicker.confirm')} onPress={confirm} style={styles.sheetBtn} />
            </View>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fieldBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Brand.border,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: Brand.surface,
  },
  fieldBtnDisabled: {
    opacity: 0.5,
  },
  fieldValue: {
    fontSize: 15,
    fontWeight: '600',
    color: Brand.textPrimary,
  },
  fieldPlaceholder: {
    color: Brand.textMuted,
    fontWeight: '400',
  },
  fieldIcon: {
    fontSize: 15,
  },
  backdrop: {
    flex: 1,
    backgroundColor: Brand.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Brand.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingTop: 18,
    paddingHorizontal: 20,
    ...shadow('lg'),
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Brand.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  wheelsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  wheelSeparator: {
    fontSize: 20,
    fontWeight: '700',
    color: Brand.textPrimary,
  },
  wheelWrap: {
    width: 72,
    position: 'relative',
  },
  wheelHighlight: {
    position: 'absolute',
    top: ITEM_HEIGHT * PAD_ROWS,
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
    borderRadius: Radius.sm,
    backgroundColor: Brand.primaryLight,
  },
  wheelItem: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelItemText: {
    fontSize: 18,
    fontWeight: '500',
    color: Brand.textMuted,
  },
  wheelItemTextActive: {
    fontSize: 22,
    fontWeight: '800',
    color: Brand.primary,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  sheetBtn: {
    flex: 1,
  },
});
