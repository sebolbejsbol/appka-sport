import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';

import { Brand, BrandFonts, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';
import { getLocale, t } from '@/i18n';

const DAYS_AHEAD = 60;

const WEEKDAYS_PL = ['nie', 'pon', 'wt', 'śr', 'czw', 'pt', 'sob'];
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_PL = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function buildUpcomingDays(): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: DAYS_AHEAD }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return d;
  });
}

type Props = {
  label: string;
  required?: boolean;
  /** "YYYY-MM-DD" albo pusty string. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

/**
 * Zastępuje ręczne wpisywanie daty (pole tekstowe "YYYY-MM-DD") listą
 * najbliższych dni do wyboru jednym dotknięciem.
 */
export function DatePickerField({ label, required, value, onChange, disabled }: Props) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const days = useMemo(buildUpcomingDays, []);
  const isEn = getLocale() === 'en';
  const weekdays = isEn ? WEEKDAYS_EN : WEEKDAYS_PL;
  const months = isEn ? MONTHS_EN : MONTHS_PL;

  const displayLabel = useMemo(() => {
    if (!value) return t('timePicker.selectDate');
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return value;
    const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return `${weekdays[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
  }, [value, weekdays, months]);

  return (
    <>
      <Pressable
        style={[styles.fieldBtn, disabled && styles.fieldBtnDisabled]}
        onPress={() => !disabled && setOpen(true)}>
        <Text style={[styles.fieldValue, !value && styles.fieldPlaceholder]}>{displayLabel}</Text>
        <Text style={styles.fieldIcon}>📅</Text>
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
            <FlatList
              data={days}
              keyExtractor={(d) => toDateInput(d)}
              numColumns={4}
              contentContainerStyle={styles.grid}
              renderItem={({ item }) => {
                const iso = toDateInput(item);
                const active = iso === value;
                return (
                  <Pressable
                    style={[styles.dayCell, active && styles.dayCellActive]}
                    onPress={() => {
                      onChange(iso);
                      setOpen(false);
                    }}>
                    <Text style={[styles.dayWeekday, active && styles.dayTextActive]}>{weekdays[item.getDay()]}</Text>
                    <Text style={[styles.dayNumber, active && styles.dayTextActive]}>{item.getDate()}</Text>
                    <Text style={[styles.dayMonth, active && styles.dayTextActive]}>{months[item.getMonth()]}</Text>
                  </Pressable>
                );
              }}
            />
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
    fontFamily: BrandFonts.bodySemibold,
    color: Brand.textPrimary,
  },
  fieldPlaceholder: {
    color: Brand.textMuted,
    fontWeight: '400',
    fontFamily: BrandFonts.body,
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
    maxHeight: '75%',
    backgroundColor: Brand.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingTop: 18,
    paddingHorizontal: 16,
    ...shadow('lg'),
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: BrandFonts.bodyBold,
    color: Brand.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
  },
  grid: {
    paddingBottom: 12,
    gap: 8,
  },
  dayCell: {
    flex: 1,
    margin: 4,
    minWidth: 70,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surfaceMuted,
  },
  dayCellActive: {
    backgroundColor: Brand.primary,
    borderColor: Brand.primary,
  },
  dayWeekday: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: BrandFonts.bodySemibold,
    color: Brand.textMuted,
    textTransform: 'uppercase',
  },
  dayNumber: {
    fontSize: 18,
    fontWeight: '800',
    fontFamily: BrandFonts.bodyBold,
    color: Brand.textPrimary,
    marginVertical: 2,
  },
  dayMonth: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: BrandFonts.bodySemibold,
    color: Brand.textMuted,
  },
  dayTextActive: {
    color: '#ffffff',
  },
});
