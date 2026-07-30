import Mapbox, {
  Camera,
  CircleLayer,
  MapView,
  ShapeSource,
  type MapState,
} from '@rnmapbox/maps';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Brand } from '@/constants/theme';
import { useUserLocation, type LngLat } from '@/hooks/use-user-location';
import { t } from '@/i18n';
import { fieldsToGeoJSON, getFieldsInBbox, type Bbox } from '@/lib/fields';
import {
  bboxAroundCenter,
  expandBbox,
  maxRowsForZoom,
  POLAND_BBOX,
  POLAND_CENTER,
} from '@/lib/map-bbox';

const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
if (token) {
  Mapbox.setAccessToken(token);
}

const DEFAULT_ZOOM = 14;
const USER_ZOOM = 15;
const LOAD_DEBOUNCE_MS = 400;
const BBOX_PADDING = 1.4;

const EMPTY_FEATURES = fieldsToGeoJSON([]);

export type FieldReportLocation = {
  lng: number;
  lat: number;
};

type Props = {
  value: FieldReportLocation | null;
  onChange: (location: FieldReportLocation) => void;
};

function zoomFromState(state?: MapState, fallback = DEFAULT_ZOOM): number {
  const z = state?.properties?.zoom;
  return typeof z === 'number' && Number.isFinite(z) ? z : fallback;
}

function centerFromState(state?: MapState, fallback: LngLat = POLAND_CENTER): LngLat {
  const center = state?.properties?.center;
  if (center && center.length >= 2 && Number.isFinite(center[0]) && Number.isFinite(center[1])) {
    return [center[0], center[1]];
  }
  return fallback;
}

function bboxFromMapState(state: MapState | undefined): Bbox | null {
  const bounds = state?.properties?.bounds;
  if (bounds?.ne && bounds?.sw) {
    const [maxLng, maxLat] = bounds.ne;
    const [minLng, minLat] = bounds.sw;
    if ([minLng, minLat, maxLng, maxLat].every(Number.isFinite)) {
      return { minLng, minLat, maxLng, maxLat };
    }
  }
  const mapCenter = state?.properties?.center;
  const mapZoom = state?.properties?.zoom;
  if (mapCenter && mapZoom != null) {
    return bboxAroundCenter([mapCenter[0], mapCenter[1]], mapZoom);
  }
  return null;
}

function CrosshairPin() {
  return (
    <View style={styles.crosshair} pointerEvents="none">
      <View style={styles.pinOuter}>
        <View style={styles.pinInner} />
      </View>
      <View style={styles.pinTail} />
    </View>
  );
}

type MapModalProps = {
  visible: boolean;
  initialCenter: LngLat;
  onConfirm: (location: FieldReportLocation) => void;
  onClose: () => void;
};

function FieldReportMapModal({ visible, initialCenter, onConfirm, onClose }: MapModalProps) {
  const insets = useSafeAreaInsets();
  const [features, setFeatures] = useState(EMPTY_FEATURES);
  const [draftLng, setDraftLng] = useState(initialCenter[0]);
  const [draftLat, setDraftLat] = useState(initialCenter[1]);
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestStateRef = useRef<MapState | undefined>(undefined);
  const requestIdRef = useRef(0);

  const initialZoom = USER_ZOOM;

  useEffect(() => {
    if (!visible) return;
    setDraftLng(initialCenter[0]);
    setDraftLat(initialCenter[1]);
  }, [visible, initialCenter]);

  const loadFields = useCallback(async (bbox: Bbox, mapZoom: number) => {
    const requestId = ++requestIdRef.current;
    const padded = expandBbox(bbox, BBOX_PADDING);
    const { data, error } = await getFieldsInBbox(padded, maxRowsForZoom(mapZoom));
    if (error || requestId !== requestIdRef.current) return;
    setFeatures(fieldsToGeoJSON(data.map((f) => ({ ...f, event_count: 0, avg_rating: f.avg_rating ?? null, rating_count: f.rating_count ?? 0 }))));
  }, []);

  const loadVisibleFields = useCallback(
    async (state?: MapState) => {
      const mapZoom = zoomFromState(state, initialZoom);
      if (mapZoom <= 11) {
        await loadFields(POLAND_BBOX, mapZoom);
        return;
      }
      const fromState = bboxFromMapState(state);
      if (fromState) {
        await loadFields(fromState, mapZoom);
        return;
      }
      await loadFields(bboxAroundCenter(centerFromState(state, initialCenter), mapZoom), mapZoom);
    },
    [initialCenter, initialZoom, loadFields],
  );

  const scheduleLoad = useCallback(() => {
    if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
    loadTimerRef.current = setTimeout(() => {
      void loadVisibleFields(latestStateRef.current);
    }, LOAD_DEBOUNCE_MS);
  }, [loadVisibleFields]);

  const onCameraUpdate = useCallback(
    (state: MapState) => {
      latestStateRef.current = state;
      const [lng, lat] = centerFromState(state, initialCenter);
      setDraftLng(lng);
      setDraftLat(lat);

      if (state.gestures.isGestureActive) {
        if (loadTimerRef.current) {
          clearTimeout(loadTimerRef.current);
          loadTimerRef.current = null;
        }
        return;
      }
      scheduleLoad();
    },
    [initialCenter, scheduleLoad],
  );

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      void loadFields(expandBbox(bboxAroundCenter(initialCenter, 12), 1.2), initialZoom);
    }, 200);
    return () => {
      clearTimeout(timer);
      if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
    };
  }, [visible, initialCenter, initialZoom, loadFields]);

  function handleConfirm() {
    onConfirm({ lng: draftLng, lat: draftLat });
    onClose();
  }

  if (!token) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <View style={[styles.modalRoot, { paddingTop: insets.top + 16 }]}>
          <Text style={styles.fallbackText}>{t('map.missingToken')}</Text>
          <Button label={t('fieldReport.cancelPicker')} variant="secondary" onPress={onClose} />
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.modalRoot}>
        <View style={[styles.modalHeader, { paddingTop: insets.top + 12 }]}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.modalClose}>
            <Text style={styles.modalCloseText}>✕</Text>
          </Pressable>
          <Text style={styles.modalTitle}>{t('fieldReport.mapPickerTitle')}</Text>
        </View>

        <View style={styles.modalMapWrap}>
          <MapView
            style={styles.modalMap}
            styleURL={Mapbox.StyleURL.Street}
            scrollEnabled
            zoomEnabled
            rotateEnabled={false}
            pitchEnabled={false}
            onCameraChanged={onCameraUpdate}
            onMapIdle={onCameraUpdate}>
            <Camera
              centerCoordinate={initialCenter}
              zoomLevel={initialZoom}
              animationMode="flyTo"
              animationDuration={0}
            />

            <ShapeSource id="report-modal-fields" shape={features}>
              <CircleLayer
                id="report-modal-fields-circles"
                style={{
                  circleRadius: 7,
                  circleColor: Brand.primary,
                  circleStrokeWidth: 2,
                  circleStrokeColor: '#ffffff',
                  circleOpacity: 0.9,
                }}
              />
            </ShapeSource>
          </MapView>

          <CrosshairPin />

          <View style={styles.modalMapHint} pointerEvents="none">
            <Text style={styles.modalMapHintText}>{t('fieldReport.mapPickerHint')}</Text>
          </View>
        </View>

        <View style={[styles.modalFooter, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Text style={styles.modalCoords}>
            {draftLat.toFixed(5)}, {draftLng.toFixed(5)}
          </Text>
          <View style={styles.modalActions}>
            <Button
              label={t('fieldReport.cancelPicker')}
              variant="secondary"
              onPress={onClose}
              style={styles.modalActionBtn}
            />
            <Button
              label={t('fieldReport.confirmLocation')}
              onPress={handleConfirm}
              style={styles.modalActionBtn}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function FieldReportLocationPicker({ value, onChange }: Props) {
  const { coords } = useUserLocation();
  const [modalOpen, setModalOpen] = useState(false);

  const defaultCenter: LngLat = value
    ? [value.lng, value.lat]
    : coords ?? POLAND_CENTER;

  return (
    <>
      <Pressable
        onPress={() => setModalOpen(true)}
        style={({ pressed }) => [styles.previewCard, pressed && styles.previewPressed]}>
        <View style={styles.previewIconWrap}>
          <Text style={styles.previewIcon}>📍</Text>
        </View>
        <View style={styles.previewMain}>
          {value ? (
            <>
              <Text style={styles.previewTitle}>{t('fieldReport.locationSelected')}</Text>
              <Text style={styles.previewCoords}>
                {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
              </Text>
              <Text style={styles.previewAction}>{t('fieldReport.changeLocation')} ›</Text>
            </>
          ) : (
            <>
              <Text style={styles.previewTitle}>{t('fieldReport.openMapPicker')}</Text>
              <Text style={styles.previewHint}>{t('fieldReport.openMapPickerHint')}</Text>
            </>
          )}
        </View>
      </Pressable>

      <FieldReportMapModal
        visible={modalOpen}
        initialCenter={defaultCenter}
        onConfirm={onChange}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
  },
  previewPressed: {
    opacity: 0.85,
  },
  previewIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: Brand.screenBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewIcon: {
    fontSize: 24,
  },
  previewMain: {
    flex: 1,
    gap: 2,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Brand.textPrimary,
  },
  previewHint: {
    fontSize: 13,
    color: Brand.textMuted,
  },
  previewCoords: {
    fontSize: 14,
    color: Brand.textSecondary,
    fontWeight: '600',
  },
  previewAction: {
    fontSize: 13,
    fontWeight: '600',
    color: Brand.primary,
    marginTop: 2,
  },
  modalRoot: {
    flex: 1,
    backgroundColor: Brand.screenBackground,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
    backgroundColor: Brand.surface,
    borderBottomWidth: 1,
    borderBottomColor: Brand.border,
  },
  modalClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.screenBackground,
  },
  modalCloseText: {
    fontSize: 16,
    color: Brand.textSecondary,
    fontWeight: '600',
  },
  modalTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: Brand.textPrimary,
  },
  modalMapWrap: {
    flex: 1,
    position: 'relative',
  },
  modalMap: {
    flex: 1,
  },
  crosshair: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -30,
    marginLeft: -15,
    alignItems: 'center',
  },
  pinOuter: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(211, 47, 47, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinInner: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Brand.danger,
    borderWidth: 2,
    borderColor: '#fff',
  },
  pinTail: {
    width: 2,
    height: 12,
    backgroundColor: Brand.danger,
    marginTop: -1,
  },
  modalMapHint: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 16,
    backgroundColor: 'rgba(255,255,255,0.94)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  modalMapHintText: {
    fontSize: 13,
    color: Brand.textSecondary,
    textAlign: 'center',
  },
  modalFooter: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
    backgroundColor: Brand.surface,
    borderTopWidth: 1,
    borderTopColor: Brand.border,
  },
  modalCoords: {
    fontSize: 14,
    fontWeight: '600',
    color: Brand.textPrimary,
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalActionBtn: {
    flex: 1,
  },
  fallbackText: {
    fontSize: 15,
    color: Brand.danger,
    textAlign: 'center',
    marginBottom: 16,
  },
});
