import Mapbox, {
  Camera,
  CircleLayer,
  FillLayer,
  Images,
  LineLayer,
  LocationPuck,
  MapView,
  MarkerView,
  ShapeSource,
  SymbolLayer,
  type MapState,
} from '@rnmapbox/maps';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FieldDetailSheet } from '@/components/field-detail-sheet';
import { MapPlaySearchBar } from '@/components/map-play-search-bar';
import { MapFiltersSheet } from '@/components/map-filters-sheet';
import { MapLocationSearch } from '@/components/map-location-search';
import { SzukajTerazSheet } from '@/components/szukaj-teraz-sheet';

import { Brand } from '@/constants/theme';
import { useUserLocation, type LngLat } from '@/hooks/use-user-location';
import { t } from '@/i18n';
import {
  fieldsToGeoJSON,
  getEventCountsInBbox,
  getFieldsByIds,
  getFieldsInBbox,
  getLockedVoivodeshipBoundaries,
  getVoivodeshipStats,
  lockedVoivodeshipsToGeoJSON,
  voivodeshipsToGeoJSON,
  type Bbox,
  type FieldPoint,
  type FieldSort,
} from '@/lib/fields';
import { listMyFavoriteFieldIds } from '@/lib/favorites';
import { markInitialDiscoverReady, markInitialFieldsReady } from '@/lib/map-ready';
import { notifyInfo } from '@/lib/toast';
import {
  applyDiscoverFilters,
  countActiveDiscoverFilters,
  DEFAULT_DISCOVER_FILTERS,
  getDiscoverEvents,
  type DiscoverEvent,
  type DiscoverFilters,
} from '@/lib/discover-events';
import {
  categoryMeta,
  eventMarkerIcon,
  markerEmoji,
  type CategoryFilter,
} from '@/lib/event-categories';
import { fieldFilterForSelection } from '@/lib/venue-types';
import type { PlaceSearchResult } from '@/lib/map-geocoding';
import { mapFieldIcons } from '@/lib/map-field-icons';
import { mapEventIcons } from '@/lib/map-event-icons';
import {
  bboxAroundCenter,
  expandBbox,
  maxRowsForZoom,
  POLAND_BBOX,
  POLAND_CENTER,
} from '@/lib/map-bbox';
import {
  onFieldEventCountChange,
  onMapFieldsRefresh,
} from '@/lib/map-field-sync';

const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
if (token) {
  Mapbox.setAccessToken(token);
}

const POLAND_CENTER_COORD: LngLat = POLAND_CENTER;
const DEFAULT_ZOOM = 6;
const USER_ZOOM = 11;
const SEARCH_ZOOM = 12;
/** Czekamy aż użytkownik skończy zoom/przesuwanie — mniej freeze'ów. */
const LOAD_DEBOUNCE_MS = 320;
const BBOX_PADDING = 1.6;
const MAX_CACHED_FIELDS = 2200;
/**
 * Poniżej tego zoomu nie pobieramy pojedynczych boisk — widok obejmuje (prawie)
 * cały kraj, boiska i tak są niewidoczne pod bąblami województw, a zapytanie
 * byłoby ciężkie (seq scan po 56k). Dzięki temu nie ma „delaya" i zacięć przy
 * oddalonym widoku. Ładowanie startuje tuż przed tym, jak boiska zaczynają się
 * wtapiać (FADE_START), więc są gotowe gdy stają się widoczne.
 */
const FIELD_LOAD_MIN_ZOOM = 6.3;
const MAX_BADGE_COUNT = 20;
const FIELD_SORT: FieldSort = 'default';

const EMPTY_FEATURES = fieldsToGeoJSON([]);
const EMPTY_VOIVODESHIPS = voivodeshipsToGeoJSON([]);
const EMPTY_LOCKED_REGIONS = lockedVoivodeshipsToGeoJSON([]);
const ACTIVE_VOIVODESHIP = 'pomorskie';
/**
 * Pasmo płynnego przejścia (cross-fade) między bąblami województw a boiskami.
 * Zamiast twardego cięcia na jednym zoomie warstwy nakładają się i wzajemnie
 * wtapiają (przezroczystość interpolowana po zoomie), dzięki czemu punkty
 * pojawiają się/znikają bez „skakania”.
 */
const FADE_START = 6.5;
const FADE_END = 7.3;

type FieldSelection = { rpc: string | null; showFields: boolean };

/** Mapowanie wybranej kategorii/podkategorii na typy obiektów na mapie. */
function fieldSelectionFor(
  category: CategoryFilter,
  subcategory: string | null,
): FieldSelection {
  return fieldFilterForSelection(category, subcategory);
}

function discoverEventsToGeoJSON(events: DiscoverEvent[]) {
  return {
    type: 'FeatureCollection' as const,
    features: events
      .filter((e) => e.lng != null && e.lat != null)
      .map((e) => {
        const meta = categoryMeta(e.category);
        return {
          type: 'Feature' as const,
          id: e.id,
          geometry: {
            type: 'Point' as const,
            coordinates: [e.lng as number, e.lat as number],
          },
          properties: {
            id: e.id,
            color: meta.color,
            emoji: markerEmoji(e.category, e.subcategory),
            icon: eventMarkerIcon(e.category, e.subcategory),
            instant: e.is_instant ? 1 : 0,
            stroke: e.is_instant ? '#16a34a' : '#ffffff',
            strokeWidth: e.is_instant ? 4 : 2,
          },
        };
      }),
  };
}

const EMPTY_EVENT_SHAPE = discoverEventsToGeoJSON([]);

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

function zoomFromState(state?: MapState, fallback = DEFAULT_ZOOM): number {
  const z = state?.properties?.zoom;
  return typeof z === 'number' && Number.isFinite(z) ? z : fallback;
}

function trimCache(cache: Map<string, FieldPoint>, incoming: FieldPoint[]) {
  for (const field of incoming) {
    cache.set(field.id, field);
  }
  if (cache.size <= MAX_CACHED_FIELDS) return;

  const keep = new Map(incoming.map((f) => [f.id, f]));
  for (const [id, field] of cache) {
    if (!keep.has(id)) keep.set(id, field);
    if (keep.size >= MAX_CACHED_FIELDS) break;
  }
  cache.clear();
  for (const [id, field] of keep) cache.set(id, field);
}

function fieldFromMapFeature(feature: GeoJSON.Feature): FieldPoint | null {
  const props = feature.properties;
  const coords =
    feature.geometry?.type === 'Point' ? feature.geometry.coordinates : undefined;
  const id = props?.id;

  if (typeof id !== 'string' || !coords || coords.length < 2) return null;

  const rawCount = props?.event_count;
  const event_count =
    typeof rawCount === 'number' ? rawCount : Number(rawCount) || 0;

  return {
    id,
    name: typeof props?.name === 'string' ? props.name : null,
    sport: typeof props?.sport === 'string' ? props.sport : null,
    lng: coords[0],
    lat: coords[1],
    event_count,
    avg_rating:
      typeof props?.avg_rating === 'number'
        ? props.avg_rating
        : props?.avg_rating != null
          ? Number(props.avg_rating) || null
          : null,
    rating_count: 0,
  };
}

export function AppMap() {
  const insets = useSafeAreaInsets();
  const { status, coords } = useUserLocation();
  const mapRef = useRef<MapView>(null);
  const cameraRef = useRef<Camera>(null);
  const [features, setFeatures] = useState(EMPTY_FEATURES);
  const [voivodeships, setVoivodeships] = useState(EMPTY_VOIVODESHIPS);
  const [lockedRegions, setLockedRegions] = useState(EMPTY_LOCKED_REGIONS);
  const [lockedLabels, setLockedLabels] = useState(EMPTY_VOIVODESHIPS);
  const [selectedField, setSelectedField] = useState<FieldPoint | null>(null);
  const [discoverEvents, setDiscoverEvents] = useState<DiscoverEvent[]>([]);
  const [filters, setFilters] = useState<DiscoverFilters>(DEFAULT_DISCOVER_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [playNowOpen, setPlayNowOpen] = useState(false);
  const [searchedPlace, setSearchedPlace] = useState<PlaceSearchResult | null>(null);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const requestIdRef = useRef(0);
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestStateRef = useRef<MapState | undefined>(undefined);
  const fieldsCacheRef = useRef<Map<string, FieldPoint>>(new Map());
  const lastZoomRef = useRef<number | null>(null);
  const fieldTapLockRef = useRef(false);
  const didCenterOnUserRef = useRef(false);
  const initialFieldsMarkedRef = useRef(false);

  const center = coords ?? POLAND_CENTER_COORD;
  const zoom = coords ? USER_ZOOM : DEFAULT_ZOOM;

  const selection = useMemo(
    () => fieldSelectionFor(filters.category, filters.subcategory),
    [filters.category, filters.subcategory],
  );
  const showFields = selection.showFields;
  const sportFilter = selection.rpc;

  const visibleEvents = useMemo(
    () => applyDiscoverFilters(discoverEvents, filters, { userCoords: coords }),
    [discoverEvents, filters, coords],
  );

  const eventShape = useMemo(
    () =>
      visibleEvents.length === 0
        ? EMPTY_EVENT_SHAPE
        : discoverEventsToGeoJSON(visibleEvents),
    [visibleEvents],
  );

  const activeFilterCount = useMemo(
    () => countActiveDiscoverFilters(filters),
    [filters],
  );

  // Liczba graczy / max na najbliższym (wg starts_at) evencie danego boiska —
  // niezależnie od aktualnych filtrów, żeby odznaka na mapie zawsze pokazywała
  // prawdziwy stan boiska, a nie tylko to, co akurat przechodzi przez filtr.
  const fieldPlayersMap = useMemo(() => {
    const soonestByField = new Map<string, DiscoverEvent>();
    for (const event of discoverEvents) {
      if (!event.field_id) continue;
      const existing = soonestByField.get(event.field_id);
      if (!existing || event.starts_at < existing.starts_at) {
        soonestByField.set(event.field_id, event);
      }
    }
    const result = new Map<string, { current: number; max: number | null }>();
    for (const [fieldId, event] of soonestByField) {
      result.set(fieldId, { current: event.participant_count, max: event.max_players });
    }
    return result;
  }, [discoverEvents]);

  const patchFilters = useCallback(
    (patch: Partial<DiscoverFilters>) => setFilters((prev) => ({ ...prev, ...patch })),
    [],
  );

  // Ulubione boiska mają zostać widoczne na mapie zawsze, niezależnie od
  // aktywnych filtrów dyscypliny/widoczności — łączymy je z każdym publikowanym
  // zestawem punktów, także gdy showFields=false (np. kategoria bez boisk).
  const favoriteFieldsRef = useRef<Map<string, FieldPoint>>(new Map());

  const loadFavoriteFields = useCallback(async () => {
    const { data: ids } = await listMyFavoriteFieldIds();
    if (ids.length === 0) {
      favoriteFieldsRef.current = new Map();
      return;
    }
    const { data: fields } = await getFieldsByIds(ids);
    favoriteFieldsRef.current = new Map(fields.map((f) => [f.id, f]));
  }, []);

  const publishFeatures = useCallback(
    (cache: Map<string, FieldPoint>) => {
      const merged = new Map(showFields ? cache : new Map<string, FieldPoint>());
      for (const [id, field] of favoriteFieldsRef.current) {
        merged.set(id, field);
      }
      const enriched = [...merged.values()].map((field) => {
        const players = fieldPlayersMap.get(field.id);
        return { ...field, players_current: players?.current ?? 0, players_max: players?.max ?? null };
      });
      setFeatures(fieldsToGeoJSON(enriched));
    },
    [showFields, fieldPlayersMap],
  );

  const applyFields = useCallback(
    (incoming: FieldPoint[], mapZoom: number) => {
      if (lastZoomRef.current != null && mapZoom < lastZoomRef.current - 1.2) {
        fieldsCacheRef.current.clear();
      }
      lastZoomRef.current = mapZoom;

      // Szeroki widok: zastąp cache (szybsze niż merge 1000+ punktów).
      if (mapZoom <= 11) {
        fieldsCacheRef.current = new Map(incoming.map((f) => [f.id, f]));
      } else {
        trimCache(fieldsCacheRef.current, incoming);
      }

      publishFeatures(fieldsCacheRef.current);
    },
    [publishFeatures],
  );

  const loadFields = useCallback(
    async (bbox: Bbox, mapZoom: number) => {
      if (!showFields) {
        fieldsCacheRef.current.clear();
        publishFeatures(fieldsCacheRef.current);
        setFieldsLoading(false);
        return;
      }

      // Zbyt oddalone — pomijamy ciężkie zapytanie (boiska niewidoczne pod bąblami).
      if (mapZoom < FIELD_LOAD_MIN_ZOOM) {
        if (fieldsCacheRef.current.size > 0) {
          fieldsCacheRef.current.clear();
          publishFeatures(fieldsCacheRef.current);
        }
        setFieldsLoading(false);
        return;
      }

      const requestId = ++requestIdRef.current;
      setFieldsLoading(true);
      const padded = expandBbox(bbox, BBOX_PADDING);
      const [fieldsRes, countsRes] = await Promise.all([
        getFieldsInBbox(padded, maxRowsForZoom(mapZoom), sportFilter, FIELD_SORT),
        getEventCountsInBbox(padded, sportFilter),
      ]);
      if (fieldsRes.error || requestId !== requestIdRef.current) {
        if (requestId === requestIdRef.current) setFieldsLoading(false);
        return;
      }

      const counts = countsRes.error ? new Map<string, number>() : countsRes.data;
      const merged = fieldsRes.data.map((field) => ({
        ...field,
        event_count: counts.get(field.id) ?? 0,
      }));
      applyFields(merged, mapZoom);
      setFieldsLoading(false);
    },
    [applyFields, publishFeatures, showFields, sportFilter],
  );

  const loadVisibleFields = useCallback(
    async (state?: MapState) => {
      const mapZoom = zoomFromState(state, zoom);
      const fromState = bboxFromMapState(state);
      if (fromState) {
        await loadFields(fromState, mapZoom);
        return;
      }
      await loadFields(bboxAroundCenter(center, mapZoom), mapZoom);
    },
    [center, loadFields, zoom],
  );

  const loadDiscover = useCallback(async () => {
    const { data, error } = await getDiscoverEvents();
    if (!error) setDiscoverEvents(data);
  }, []);

  const bumpFieldEventCount = useCallback(
    (fieldId: string, delta: number) => {
      const cached = fieldsCacheRef.current.get(fieldId);
      if (!cached) {
        void loadVisibleFields(latestStateRef.current);
        return;
      }

      const nextCount = Math.max(
        0,
        Math.min(MAX_BADGE_COUNT, (cached.event_count ?? 0) + delta),
      );
      fieldsCacheRef.current.set(fieldId, { ...cached, event_count: nextCount });
      publishFeatures(fieldsCacheRef.current);
      setSelectedField((prev) =>
        prev?.id === fieldId ? { ...prev, event_count: nextCount } : prev,
      );
    },
    [loadVisibleFields, publishFeatures],
  );

  useEffect(() => {
    let active = true;
    void getVoivodeshipStats(sportFilter).then(({ data, error }) => {
      // Bąbel z liczbą boisk pokazujemy tylko dla aktywnego województwa
      // (Trójmiasto) — reszta ma zamiast tego szarą nakładkę "Coming soon".
      if (active && !error && data.length > 0) {
        setVoivodeships(voivodeshipsToGeoJSON(data.filter((r) => r.voivodeship === ACTIVE_VOIVODESHIP)));
        setLockedLabels(voivodeshipsToGeoJSON(data.filter((r) => r.voivodeship !== ACTIVE_VOIVODESHIP)));
      }
    });
    return () => {
      active = false;
    };
  }, [sportFilter]);

  useEffect(() => {
    let active = true;
    void getLockedVoivodeshipBoundaries(ACTIVE_VOIVODESHIP).then(({ data, error }) => {
      if (active && !error && data.length > 0) {
        setLockedRegions(lockedVoivodeshipsToGeoJSON(data));
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void loadDiscover().finally(markInitialDiscoverReady);
  }, [loadDiscover]);

  // Kamera startuje na widoku Polski (defaultSettings). Gdy lokalizacja użytkownika
  // dojdzie już po zamontowaniu mapy, JEDNORAZOWO płynnie przesuwamy na użytkownika —
  // imperatywnie, więc nie „cofa" zoomu przy kolejnych renderach.
  useEffect(() => {
    if (didCenterOnUserRef.current || !coords) return;
    didCenterOnUserRef.current = true;
    cameraRef.current?.setCamera({
      centerCoordinate: coords,
      zoomLevel: USER_ZOOM,
      animationDuration: 700,
    });
  }, [coords]);

  useEffect(() => {
    void loadFavoriteFields().then(() => publishFeatures(fieldsCacheRef.current));
  }, [loadFavoriteFields, publishFeatures]);

  useEffect(() => {
    const unsubCount = onFieldEventCountChange(bumpFieldEventCount);
    const unsubRefresh = onMapFieldsRefresh(() => {
      void loadDiscover();
      void loadVisibleFields(latestStateRef.current);
      void loadFavoriteFields().then(() => publishFeatures(fieldsCacheRef.current));
    });
    return () => {
      unsubCount();
      unsubRefresh();
    };
  }, [bumpFieldEventCount, loadDiscover, loadFavoriteFields, loadVisibleFields, publishFeatures]);

  const scheduleLoad = useCallback(() => {
    if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
    loadTimerRef.current = setTimeout(() => {
      loadVisibleFields(latestStateRef.current);
    }, LOAD_DEBOUNCE_MS);
  }, [loadVisibleFields]);

  const runLoadNow = useCallback(() => {
    if (loadTimerRef.current) {
      clearTimeout(loadTimerRef.current);
      loadTimerRef.current = null;
    }
    void loadVisibleFields(latestStateRef.current);
  }, [loadVisibleFields]);

  const onCameraChanged = useCallback(
    (state: MapState) => {
      latestStateRef.current = state;

      // Zawsze planujemy załadowanie (debounced). Debounce sam pilnuje, by
      // zapytanie poszło dopiero gdy ruch ustanie (~po przerwie), więc nie ma
      // ładowań w trakcie szczypania, a jednocześnie NIE zależymy od onMapIdle
      // ani od flagi gestu (które po geście bywają niewyzwalane na Androidzie).
      scheduleLoad();
    },
    [scheduleLoad],
  );

  // Gdy mapa się zatrzyma (np. po przewinięciu do nowego miasta) — ładuj od razu,
  // niezależnie od stanu gestów. Dzięki temu boiska pojawiają się bez ręcznego
  // odświeżania wyszukiwania.
  const onMapIdle = useCallback(
    (state: MapState) => {
      latestStateRef.current = state;
      runLoadNow();
    },
    [runLoadNow],
  );

  useEffect(() => {
    const wideBbox = coords
      ? expandBbox(bboxAroundCenter(center, USER_ZOOM), 1.4)
      : POLAND_BBOX;

    const timer = setTimeout(() => {
      void loadFields(wideBbox, coords ? USER_ZOOM : DEFAULT_ZOOM).finally(() => {
        // Tylko pierwsze zakończone ładowanie liczy się dla sygnału "gotowości"
        // startowej apki — kolejne (np. po doprecyzowaniu lokalizacji użytkownika)
        // nie powinny przedłużać splasha.
        if (!initialFieldsMarkedRef.current) {
          initialFieldsMarkedRef.current = true;
          markInitialFieldsReady();
        }
      });
    }, 800);
    return () => {
      clearTimeout(timer);
      if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
    };
  }, [center, coords, loadFields]);

  useEffect(() => {
    fieldsCacheRef.current.clear();
    void loadVisibleFields(latestStateRef.current);
  }, [showFields, sportFilter, loadVisibleFields]);

  const onFieldPress = useCallback((event: { features?: GeoJSON.Feature[] }) => {
    const feature = event.features?.[0];
    if (!feature) return;

    // Tap w grupę (cluster) -> przybliż, żeby się rozdzieliła
    if (feature.properties?.point_count != null) {
      const coords =
        feature.geometry?.type === 'Point' ? feature.geometry.coordinates : null;
      if (coords) {
        const currentZoom =
          latestStateRef.current?.properties?.zoom ?? lastZoomRef.current ?? 10;
        cameraRef.current?.setCamera({
          centerCoordinate: [coords[0], coords[1]],
          zoomLevel: Math.min(currentZoom + 2.5, 15),
          animationDuration: 600,
        });
      }
      fieldTapLockRef.current = true;
      setTimeout(() => {
        fieldTapLockRef.current = false;
      }, 0);
      return;
    }

    const field = fieldFromMapFeature(feature);
    if (!field) return;

    fieldTapLockRef.current = true;
    setSelectedField(field);
    setTimeout(() => {
      fieldTapLockRef.current = false;
    }, 0);
  }, []);

  const onEventPress = useCallback((event: { features?: GeoJSON.Feature[] }) => {
    const id = event.features?.[0]?.properties?.id;
    if (typeof id !== 'string') return;
    fieldTapLockRef.current = true;
    router.push({ pathname: '/event/[id]', params: { id } });
    setTimeout(() => {
      fieldTapLockRef.current = false;
    }, 0);
  }, []);

  const onMapPress = useCallback(() => {
    if (fieldTapLockRef.current) return;
    setSelectedField(null);
  }, []);

  const onLockedRegionPress = useCallback(() => {
    notifyInfo(`🔒 ${t('map.comingSoon')}`);
  }, []);

  const onVoivodeshipPress = useCallback((event: { features?: GeoJSON.Feature[] }) => {
    const feature = event.features?.[0];
    const coords =
      feature?.geometry?.type === 'Point' ? feature.geometry.coordinates : null;
    if (!coords) return;
    fieldTapLockRef.current = true;
    cameraRef.current?.setCamera({
      centerCoordinate: [coords[0], coords[1]],
      zoomLevel: 8.6,
      animationDuration: 700,
    });
    setTimeout(() => {
      fieldTapLockRef.current = false;
    }, 0);
  }, []);

  const flyToPlace = useCallback(
    (place: PlaceSearchResult) => {
      fieldsCacheRef.current.clear();
      lastZoomRef.current = SEARCH_ZOOM;
      setSearchedPlace(place);

      cameraRef.current?.setCamera({
        centerCoordinate: place.center,
        zoomLevel: SEARCH_ZOOM,
        animationDuration: 1200,
      });

      setTimeout(() => {
        void loadFields(bboxAroundCenter(place.center, SEARCH_ZOOM), SEARCH_ZOOM);
      }, 1250);
    },
    [loadFields],
  );

  if (!token) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>{t('map.missingToken')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.map}>
      <MapView
        ref={mapRef}
        style={styles.map}
        styleURL={Mapbox.StyleURL.Street}
        logoEnabled={false}
        attributionEnabled={false}
        scaleBarEnabled={false}
        onCameraChanged={onCameraChanged}
        onMapIdle={onMapIdle}
        onPress={onMapPress}>
        {/* Kamera ustawia się RAZ (defaultSettings). Kontrolowane centerCoordinate/zoomLevel
            powodowały „pulsowanie" i cofanie zoomu — przy każdym renderze (np. po doładowaniu
            boisk) kamera wracała do tych wartości, walcząc z gestem użytkownika. Teraz ruchy
            kamery robimy wyłącznie imperatywnie przez cameraRef.setCamera. */}
        <Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: center,
            zoomLevel: zoom,
          }}
        />

        <Images images={mapFieldIcons} />
        <Images images={mapEventIcons} />

        <ShapeSource
          id="fields"
          shape={features}
          onPress={onFieldPress}
          cluster
          clusterRadius={55}
          clusterMaxZoomLevel={13}>
          {/* Tęczowa poświata grup — kolor wg liczebności grupy */}
          <CircleLayer
            id="clusters-halo"
            filter={['has', 'point_count']}
            minZoomLevel={FADE_START}
            style={{
              circleRadius: [
                'interpolate',
                ['linear'],
                ['get', 'point_count'],
                1, 20,
                25, 25,
                100, 31,
                500, 38,
              ],
              circleColor: [
                'interpolate',
                ['linear'],
                ['get', 'point_count'],
                1, '#22d3ee',
                15, '#22c55e',
                60, '#eab308',
                200, '#f97316',
                600, '#ef4444',
                1500, '#d946ef',
              ],
              circleBlur: 0.8,
              circleOpacity: ['interpolate', ['linear'], ['zoom'], FADE_START, 0, FADE_END, 0.35],
            }}
          />
          {/* Grupy boisk (przy oddaleniu) — czyste bąble, bez nakładania */}
          <CircleLayer
            id="clusters"
            filter={['has', 'point_count']}
            minZoomLevel={FADE_START}
            style={{
              circleRadius: [
                'interpolate',
                ['linear'],
                ['get', 'point_count'],
                1, 13,
                25, 17,
                100, 21,
                500, 27,
              ],
              circleColor: [
                'interpolate',
                ['linear'],
                ['get', 'point_count'],
                1, '#22d3ee',
                15, '#22c55e',
                60, '#eab308',
                200, '#f97316',
                600, '#ef4444',
                1500, '#d946ef',
              ],
              circleOpacity: ['interpolate', ['linear'], ['zoom'], FADE_START, 0, FADE_END, 0.94],
              circleStrokeWidth: 2,
              circleStrokeColor: '#ffffff',
              circleStrokeOpacity: ['interpolate', ['linear'], ['zoom'], FADE_START, 0, FADE_END, 1],
            }}
          />
          <SymbolLayer
            id="cluster-count"
            filter={['has', 'point_count']}
            minZoomLevel={FADE_START}
            style={{
              textField: ['get', 'point_count_abbreviated'],
              textSize: ['step', ['get', 'point_count'], 12, 100, 14, 500, 16],
              textColor: '#ffffff',
              textOpacity: ['interpolate', ['linear'], ['zoom'], FADE_START, 0, FADE_END, 1],
              textHaloColor: 'rgba(15,23,42,0.6)',
              textHaloWidth: 1.4,
              textAllowOverlap: true,
              textIgnorePlacement: true,
              textPitchAlignment: 'viewport',
            }}
          />
          {/* Tęczowa poświata obiektu — kolor wg liczby eventów (heatmapa) */}
          <CircleLayer
            id="fields-halo"
            filter={['!', ['has', 'point_count']]}
            minZoomLevel={FADE_START}
            style={{
              circleRadius: [
                'interpolate',
                ['linear'],
                ['zoom'],
                7, 12,
                12, 22,
                14, 28,
                16, 34,
                18, 40,
              ],
              circleColor: [
                'interpolate',
                ['linear'],
                ['get', 'event_count'],
                0, '#22d3ee',
                1, '#22c55e',
                3, '#eab308',
                6, '#f97316',
                10, '#ef4444',
                20, '#d946ef',
              ],
              circleBlur: 0.7,
              circleOpacity: ['interpolate', ['linear'], ['zoom'], FADE_START, 0, FADE_END, 0.55],
            }}
          />
          {/* Znacznik obiektu — gotowa ikonka (kolorowa kropka + wypalone emoji).
              Obrazek, bo Mapbox nie renderuje emoji w tekście (gł. Android). */}
          <SymbolLayer
            id="fields-icon"
            filter={['!', ['has', 'point_count']]}
            minZoomLevel={FADE_START}
            style={{
              iconImage: ['get', 'icon'],
              iconSize: [
                'interpolate',
                ['linear'],
                ['zoom'],
                7, 0.42,
                12, 0.62,
                14, 0.78,
                16, 1.0,
                18, 1.2,
              ],
              iconOpacity: ['interpolate', ['linear'], ['zoom'], FADE_START, 0, FADE_END, 1],
              iconAllowOverlap: true,
              iconIgnorePlacement: true,
              iconPitchAlignment: 'viewport',
            }}
          />
          {/* Plakietka: liczba graczy / max na najbliższym evencie tego boiska */}
          <CircleLayer
            id="fields-badge-bg"
            filter={['all', ['!', ['has', 'point_count']], ['!=', ['get', 'availability'], 'empty']]}
            minZoomLevel={FADE_START}
            style={{
              circleRadius: [
                'interpolate',
                ['linear'],
                ['zoom'],
                12, 7,
                14, 8.5,
                16, 10,
                18, 12,
              ],
              circleColor: [
                'match',
                ['get', 'availability'],
                'full', Brand.danger,
                'open', Brand.success,
                '#94a3b8',
              ],
              circleStrokeWidth: 1.8,
              circleStrokeColor: '#ffffff',
              circleTranslate: [
                'interpolate',
                ['linear'],
                ['zoom'],
                12, ['literal', [9, -9]],
                16, ['literal', [15, -15]],
                18, ['literal', [18, -18]],
              ],
              circleTranslateAnchor: 'viewport',
              circlePitchAlignment: 'viewport',
              circleOpacity: ['interpolate', ['linear'], ['zoom'], FADE_START, 0, FADE_END, 1],
              circleStrokeOpacity: ['interpolate', ['linear'], ['zoom'], FADE_START, 0, FADE_END, 1],
              circleSortKey: 1000,
            }}
          />
          <SymbolLayer
            id="fields-badge-text"
            filter={['all', ['!', ['has', 'point_count']], ['!=', ['get', 'availability'], 'empty']]}
            minZoomLevel={FADE_START}
            style={{
              textField: ['get', 'count_label'],
              textSize: [
                'interpolate',
                ['linear'],
                ['zoom'],
                12, 8,
                14, 9.5,
                16, 11,
                18, 12,
              ],
              textColor: '#ffffff',
              textOpacity: ['interpolate', ['linear'], ['zoom'], FADE_START, 0, FADE_END, 1],
              textTranslate: [
                'interpolate',
                ['linear'],
                ['zoom'],
                12, ['literal', [9, -9]],
                16, ['literal', [15, -15]],
                18, ['literal', [18, -18]],
              ],
              textTranslateAnchor: 'viewport',
              textAllowOverlap: true,
              textIgnorePlacement: true,
              textPitchAlignment: 'viewport',
            }}
          />
        </ShapeSource>

        {/* Poza Trójmiastem: stała, niewygasająca z zoomem szara blokada —
            boiska i tak nigdy stamtąd nie ładują się (fields_in_bbox jest
            ograniczone do woj. pomorskiego), to tylko sygnalizuje dlaczego. */}
        <ShapeSource id="locked-regions" shape={lockedRegions} onPress={onLockedRegionPress}>
          <FillLayer
            id="locked-regions-fill"
            style={{
              fillColor: '#94a3b8',
              fillOpacity: 0.6,
            }}
          />
          <LineLayer
            id="locked-regions-outline"
            style={{
              lineColor: '#475569',
              lineWidth: 1.5,
              lineDasharray: [2, 2],
            }}
          />
          <SymbolLayer
            id="locked-regions-repeat-lock"
            style={{
              symbolPlacement: 'line',
              symbolSpacing: 120,
              textField: '🔒',
              textSize: 16,
              textAllowOverlap: true,
              textIgnorePlacement: true,
              textPitchAlignment: 'viewport',
              textRotationAlignment: 'viewport',
            }}
          />
        </ShapeSource>

        <ShapeSource id="locked-region-labels" shape={lockedLabels}>
          <SymbolLayer
            id="locked-region-labels-text"
            style={{
              textField: ['concat', '🔒 ', t('map.comingSoon')],
              textSize: 13,
              textColor: '#334155',
              textHaloColor: '#f1f5f9',
              textHaloWidth: 1.4,
              textAllowOverlap: true,
              textIgnorePlacement: true,
              textPitchAlignment: 'viewport',
            }}
          />
        </ShapeSource>

        <ShapeSource id="voivodeships" shape={voivodeships} onPress={onVoivodeshipPress}>
          {/* Tęczowa poświata — kolor wg liczby obiektów (heatmapa) */}
          <CircleLayer
            id="voiv-halo"
            maxZoomLevel={FADE_END}
            style={{
              circleRadius: [
                'interpolate',
                ['linear'],
                ['get', 'court_count'],
                1, 28,
                500, 34,
                1000, 40,
                1500, 46,
              ],
              circleColor: [
                'interpolate',
                ['linear'],
                ['get', 'court_count'],
                0, '#22d3ee',
                150, '#22c55e',
                500, '#eab308',
                1000, '#f97316',
                1800, '#ef4444',
                2600, '#d946ef',
              ],
              circleBlur: 0.8,
              circleOpacity: ['interpolate', ['linear'], ['zoom'], FADE_START, 0.4, FADE_END, 0],
            }}
          />
          <CircleLayer
            id="voiv-circle"
            maxZoomLevel={FADE_END}
            style={{
              circleRadius: [
                'interpolate',
                ['linear'],
                ['get', 'court_count'],
                1, 18,
                500, 22,
                1000, 26,
                1500, 30,
              ],
              circleColor: [
                'interpolate',
                ['linear'],
                ['get', 'court_count'],
                0, '#22d3ee',
                150, '#22c55e',
                500, '#eab308',
                1000, '#f97316',
                1800, '#ef4444',
                2600, '#d946ef',
              ],
              circleOpacity: ['interpolate', ['linear'], ['zoom'], FADE_START, 0.96, FADE_END, 0],
              circleStrokeWidth: 3,
              circleStrokeColor: '#ffffff',
              circleStrokeOpacity: ['interpolate', ['linear'], ['zoom'], FADE_START, 1, FADE_END, 0],
            }}
          />
          <SymbolLayer
            id="voiv-count"
            maxZoomLevel={FADE_END}
            style={{
              textField: ['get', 'count_label'],
              textSize: ['step', ['get', 'court_count'], 13, 1000, 15],
              textColor: '#ffffff',
              textOpacity: ['interpolate', ['linear'], ['zoom'], FADE_START, 1, FADE_END, 0],
              textHaloColor: 'rgba(15,23,42,0.55)',
              textHaloWidth: 1.4,
              textAllowOverlap: true,
              textIgnorePlacement: true,
              textPitchAlignment: 'viewport',
            }}
          />
          <SymbolLayer
            id="voiv-name"
            maxZoomLevel={FADE_END}
            style={{
              textField: ['get', 'label'],
              textSize: 11,
              textColor: '#1f2937',
              textOpacity: ['interpolate', ['linear'], ['zoom'], FADE_START, 1, FADE_END, 0],
              textHaloColor: '#ffffff',
              textHaloWidth: 1.4,
              textOffset: [0, 1.7],
              textAnchor: 'top',
              textAllowOverlap: false,
              textIgnorePlacement: false,
              textPitchAlignment: 'viewport',
            }}
          />
        </ShapeSource>

        {/* Wydarzenia (sport + rozszerzone) — ikonka PNG z emoji wg podkategorii */}
        <ShapeSource id="discover-events" shape={eventShape} onPress={onEventPress}>
          {/* Zielona poświata dla „szukam teraz" (instant) */}
          <CircleLayer
            id="discover-event-instant"
            filter={['==', ['get', 'instant'], 1]}
            minZoomLevel={FADE_START}
            style={{
              circleRadius: [
                'interpolate',
                ['linear'],
                ['zoom'],
                FADE_START, 14,
                FADE_END, 20,
              ],
              circleColor: '#16a34a',
              circleBlur: 0.5,
              circleOpacity: ['interpolate', ['linear'], ['zoom'], FADE_START, 0, FADE_END, 0.5],
            }}
          />
          <SymbolLayer
            id="discover-event-icon"
            minZoomLevel={FADE_START}
            style={{
              iconImage: ['get', 'icon'],
              iconSize: [
                'interpolate',
                ['linear'],
                ['zoom'],
                FADE_START, 0.6,
                FADE_END, 0.92,
              ],
              iconOpacity: ['interpolate', ['linear'], ['zoom'], FADE_START, 0, FADE_END, 1],
              iconAllowOverlap: true,
              iconIgnorePlacement: true,
              iconPitchAlignment: 'viewport',
            }}
          />
        </ShapeSource>

        {searchedPlace ? (
          <MarkerView
            id="searched-place"
            coordinate={searchedPlace.center}
            anchor={{ x: 0.5, y: 1 }}
            allowOverlap>
            <Pressable
              onPress={() => setSearchedPlace(null)}
              hitSlop={8}
              style={styles.searchPinWrap}>
              <View style={styles.searchPinBubble}>
                <Text style={styles.searchPinLabel} numberOfLines={1}>
                  {searchedPlace.label}
                </Text>
              </View>
              <View style={styles.searchPinHead}>
                <Text style={styles.searchPinGlyph}>📍</Text>
              </View>
              <View style={styles.searchPinTail} />
            </Pressable>
          </MarkerView>
        ) : null}

        {status === 'granted' ? <LocationPuck pulsing="default" /> : null}
      </MapView>

      {status === 'denied' ? (
        <View style={styles.hint} pointerEvents="none">
          <Text style={styles.hintText}>{t('map.locationDenied')}</Text>
        </View>
      ) : null}

      {!selectedField ? (
        <MapLocationSearch topOffset={insets.top + 10} onSelectPlace={flyToPlace} />
      ) : null}

      {!selectedField ? (
        <MapPlaySearchBar
          topOffset={insets.top + 64}
          activeCount={activeFilterCount}
          loading={fieldsLoading}
          onPress={() => setFiltersOpen(true)}
        />
      ) : null}

      <MapFiltersSheet
        visible={filtersOpen}
        filters={filters}
        onChange={patchFilters}
        onReset={() => setFilters(DEFAULT_DISCOVER_FILTERS)}
        onClose={() => setFiltersOpen(false)}
        resultCount={visibleEvents.length}
      />

      {!selectedField ? (
        <Pressable
          onPress={() => setPlayNowOpen(true)}
          style={({ pressed }) => [
            styles.playNowFab,
            { bottom: insets.bottom + 24 },
            pressed && styles.playNowFabPressed,
          ]}>
          <Text style={styles.playNowFabText}>🔎 {t('playNow.button')}</Text>
        </Pressable>
      ) : null}

      <SzukajTerazSheet
        visible={playNowOpen}
        userCoords={coords}
        onClose={() => setPlayNowOpen(false)}
        onCreate={() => router.push('/event/create')}
      />

      <FieldDetailSheet
        field={selectedField}
        userCoords={coords}
        onClose={() => setSelectedField(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: Brand.screenBackground,
  },
  fallbackText: {
    fontSize: 15,
    color: Brand.danger,
    textAlign: 'center',
  },
  hint: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  hintText: {
    fontSize: 13,
    color: Brand.textSecondary,
    textAlign: 'center',
  },
  playNowFab: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: '#16a34a',
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  playNowFabPressed: {
    opacity: 0.9,
  },
  playNowFabText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 15,
  },
  searchPinWrap: {
    alignItems: 'center',
  },
  searchPinBubble: {
    maxWidth: 180,
    backgroundColor: Brand.primary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    marginBottom: 4,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  searchPinLabel: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
  },
  searchPinHead: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Brand.primary,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  searchPinGlyph: {
    fontSize: 16,
  },
  searchPinTail: {
    width: 2,
    height: 8,
    backgroundColor: Brand.primary,
  },
});
