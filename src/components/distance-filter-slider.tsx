import { useCallback, useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Brand } from '@/constants/theme';
import { t } from '@/i18n';
import { distanceFilterLabel } from '@/lib/event-filter-display';

const MIN_KM = 1;
const MAX_KM = 30;
const STEP_KM = 0.5;
const DEFAULT_KM = 10;
const THUMB_SIZE = 22;

type Props = {
  value: number | null;
  onChange: (km: number | null) => void;
};

function clampKm(raw: number): number {
  const clamped = Math.min(MAX_KM, Math.max(MIN_KM, raw));
  return Math.round(clamped / STEP_KM) * STEP_KM;
}

function kmToRatio(km: number): number {
  return (km - MIN_KM) / (MAX_KM - MIN_KM);
}

export function DistanceFilterSlider({ value, onChange }: Props) {
  const unlimited = value == null;
  const sliderValue = value ?? DEFAULT_KM;
  const trackWidthRef = useRef(0);
  const [trackWidth, setTrackWidth] = useState(0);

  const setFromX = useCallback(
    (x: number) => {
      if (trackWidthRef.current <= 0) return;
      const ratio = Math.min(1, Math.max(0, x / trackWidthRef.current));
      const km = MIN_KM + ratio * (MAX_KM - MIN_KM);
      onChange(clampKm(km));
    },
    [onChange],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !unlimited,
        onMoveShouldSetPanResponder: () => !unlimited,
        onPanResponderGrant: (event) => setFromX(event.nativeEvent.locationX),
        onPanResponderMove: (event) => setFromX(event.nativeEvent.locationX),
      }),
    [setFromX, unlimited],
  );

  function onTrackLayout(event: LayoutChangeEvent) {
    const width = event.nativeEvent.layout.width;
    trackWidthRef.current = width;
    setTrackWidth(width);
  }

  const fillWidth =
    trackWidth > 0 ? kmToRatio(sliderValue) * Math.max(0, trackWidth - THUMB_SIZE) + THUMB_SIZE / 2 : 0;
  const thumbLeft =
    trackWidth > 0 ? kmToRatio(sliderValue) * Math.max(0, trackWidth - THUMB_SIZE) : 0;

  return (
    <View style={styles.block}>
      <View style={styles.header}>
        <Text style={styles.label}>{t('eventFilters.distanceLabel')}</Text>
        <Text style={styles.value}>{distanceFilterLabel(value)}</Text>
      </View>

      <View style={[styles.sliderWrap, unlimited && styles.sliderDisabled]}>
        <View
          style={styles.trackHit}
          onLayout={onTrackLayout}
          {...(!unlimited ? panResponder.panHandlers : {})}>
          <Pressable
            disabled={unlimited}
            onPress={(event) => setFromX(event.nativeEvent.locationX)}
            style={styles.track}>
            <View style={[styles.trackFill, { width: fillWidth }]} />
            <View style={[styles.thumb, { left: thumbLeft }]} />
          </Pressable>
        </View>
        <View style={styles.scale}>
          <Text style={styles.scaleText}>{MIN_KM} km</Text>
          <Text style={styles.scaleText}>{MAX_KM} km</Text>
        </View>
      </View>

      <Pressable
        onPress={() => onChange(unlimited ? DEFAULT_KM : null)}
        style={({ pressed }) => [
          styles.unlimitedChip,
          unlimited && styles.unlimitedChipActive,
          pressed && styles.pressed,
        ]}>
        <Text style={[styles.unlimitedText, unlimited && styles.unlimitedTextActive]}>
          {t('eventFilters.distanceUnlimited')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Brand.textSecondary,
  },
  value: {
    fontSize: 15,
    fontWeight: '600',
    color: Brand.primary,
  },
  sliderWrap: {
    paddingHorizontal: 4,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: Brand.screenBackground,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  sliderDisabled: {
    opacity: 0.45,
  },
  trackHit: {
    paddingVertical: 10,
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: Brand.border,
    justifyContent: 'center',
  },
  trackFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 2,
    backgroundColor: Brand.primary,
  },
  thumb: {
    position: 'absolute',
    top: -9,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: Brand.primary,
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  scale: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: 2,
  },
  scaleText: {
    fontSize: 11,
    color: Brand.textMuted,
  },
  unlimitedChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
  },
  unlimitedChipActive: {
    borderColor: Brand.primary,
    backgroundColor: Brand.primaryLight,
  },
  unlimitedText: {
    fontSize: 13,
    fontWeight: '600',
    color: Brand.textSecondary,
  },
  unlimitedTextActive: {
    color: Brand.primary,
  },
  pressed: {
    opacity: 0.85,
  },
});
