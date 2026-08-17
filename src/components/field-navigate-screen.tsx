import Mapbox, {
  Camera,
  LineLayer,
  LocationPuck,
  MapView,
  MarkerView,
  ShapeSource,
  type Camera as CameraRef,
} from '@rnmapbox/maps';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brand, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';
import { DestinationPin } from '@/components/destination-pin';
import { TravelModePicker } from '@/components/travel-mode-picker';
import { useWatchingLocation } from '@/hooks/use-watching-location';
import { t } from '@/i18n';
import { formatCourtName } from '@/lib/field-display';
import {
  fetchRoute,
  formatRouteSummary,
  type FieldRoute,
  type TravelProfile,
} from '@/lib/field-navigation';
import { canOpenLocationSettings, openLocationSettings } from '@/lib/location-permission';
import { goBack } from '@/lib/navigation';

const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
if (token) {
  Mapbox.setAccessToken(token);
}

export default function FieldNavigateScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ lat?: string; lng?: string; name?: string }>();
  const mapRef = useRef<MapView>(null);
  const cameraRef = useRef<CameraRef>(null);

  const destLat = Number(params.lat);
  const destLng = Number(params.lng);
  const destName = formatCourtName(params.name ?? null);
  const destination = useMemo(
    () => (Number.isFinite(destLat) && Number.isFinite(destLng) ? ([destLng, destLat] as const) : null),
    [destLat, destLng],
  );

  const { status, coords, requestLocation } = useWatchingLocation(Boolean(destination));
  const [profile, setProfile] = useState<TravelProfile>('walking');
  const [route, setRoute] = useState<FieldRoute | null>(null);
  const [loadingRoute, setLoadingRoute] = useState(true);
  const [routeError, setRouteError] = useState(false);

  const loadRoute = useCallback(async () => {
    if (!destination || !coords) return;
    setLoadingRoute(true);
    setRouteError(false);
    const { data, error } = await fetchRoute(coords, [destination[0], destination[1]], profile);
    if (error || !data) {
      setRouteError(true);
      setRoute(null);
    } else {
      setRoute(data);
      const coordsList = data.geometry.coordinates;
      if (coordsList.length >= 2) {
        const lngs = coordsList.map((c) => c[0]);
        const lats = coordsList.map((c) => c[1]);
        const ne: [number, number] = [Math.max(...lngs), Math.max(...lats)];
        const sw: [number, number] = [Math.min(...lngs), Math.min(...lats)];
        cameraRef.current?.fitBounds(ne, sw, 80, 800);
      }
    }
    setLoadingRoute(false);
  }, [coords, destination, profile]);

  useEffect(() => {
    if (coords && destination) {
      void loadRoute();
    }
  }, [coords, destination, profile, loadRoute]);

  const summary = route ? formatRouteSummary(route) : null;

  const routeFeature = useMemo(() => {
    if (!route) return null;
    return {
      type: 'Feature' as const,
      properties: {},
      geometry: route.geometry,
    };
  }, [route]);

  if (!token) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>{t('map.missingToken')}</Text>
      </View>
    );
  }

  if (!destination) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>{t('fieldNavigation.invalidDestination')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView ref={mapRef} style={styles.map} styleURL={Mapbox.StyleURL.Street}>
        <Camera
          ref={cameraRef}
          centerCoordinate={[destination[0], destination[1]]}
          zoomLevel={14}
          animationMode="flyTo"
          animationDuration={0}
        />

        {routeFeature ? (
          <ShapeSource id="route" shape={routeFeature}>
            <LineLayer
              id="route-line"
              style={{
                lineColor: Brand.primary,
                lineWidth: 5,
                lineOpacity: 0.9,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </ShapeSource>
        ) : null}

        <MarkerView coordinate={[destination[0], destination[1]]} anchor={{ x: 0.5, y: 1 }}>
          <DestinationPin />
        </MarkerView>

        {status === 'granted' ? <LocationPuck pulsing="default" /> : null}
      </MapView>

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => goBack('/')} style={styles.backBtn} hitSlop={12}>
          <Text style={styles.backText}>‹ {t('common.back')}</Text>
        </Pressable>
      </View>

      <View style={[styles.panel, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={styles.title}>{t('fieldNavigation.inAppTitle')}</Text>
        <Text style={styles.subtitle}>{destName}</Text>

        <TravelModePicker value={profile} onChange={setProfile} style={styles.modePicker} />

        {status === 'denied' ? (
          <View>
            <Text style={styles.muted}>{t('fieldNavigation.locationDenied')}</Text>
            <Pressable
              onPress={() => {
                if (canOpenLocationSettings) void openLocationSettings();
                else requestLocation();
              }}
              style={styles.retryBtn}>
              <Text style={styles.retryBtnText}>
                {canOpenLocationSettings
                  ? t('fieldNavigation.openSettings')
                  : t('fieldNavigation.retryLocation')}
              </Text>
            </Pressable>
          </View>
        ) : loadingRoute || !coords ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={Brand.primary} />
            <Text style={styles.muted}>{t('fieldNavigation.loadingRoute')}</Text>
          </View>
        ) : routeError ? (
          <Text style={styles.muted}>{t('fieldNavigation.routeError')}</Text>
        ) : summary ? (
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>{t('fieldNavigation.distance')}</Text>
              <Text style={styles.statValue}>{summary.distance}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>{t('fieldNavigation.eta')}</Text>
              <Text style={styles.statValue}>{summary.duration}</Text>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Brand.screenBackground,
  },
  map: {
    flex: 1,
  },
  modePicker: {
    marginBottom: 12,
  },
  topBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 0,
  },
  backBtn: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  backText: {
    fontSize: 15,
    fontWeight: '600',
    color: Brand.textPrimary,
  },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Brand.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: 20,
    paddingTop: 16,
    ...shadow('up'),
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: Brand.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Brand.textPrimary,
    marginTop: 4,
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  stat: {
    flex: 1,
    backgroundColor: Brand.screenBackground,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  statLabel: {
    fontSize: 12,
    color: Brand.textMuted,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: Brand.textPrimary,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  muted: {
    fontSize: 14,
    color: Brand.textMuted,
    paddingVertical: 8,
  },
  retryBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Brand.primary,
    marginBottom: 8,
  },
  retryBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: Brand.primary,
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  fallbackText: {
    fontSize: 15,
    color: Brand.danger,
    textAlign: 'center',
  },
});
