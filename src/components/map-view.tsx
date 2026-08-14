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

import { BOTTOM_NAV_HEIGHT } from '@/components/app-side-menu';
import { FieldDetailSheet } from '@/components/field-detail-sheet';
import { MapPlaySearchBar } from '@/components/map-play-search-bar';
import { NearbyEventsSheet } from '@/components/nearby-events-sheet';
import {
  MapNearbySheet,
  NEARBY_SHEET_COLLAPSED_HEIGHT,
  NEARBY_SHEET_SKELETON_HEIGHT,
  type NearbyFieldItem,
} from '@/components/map-nearby-sheet';
import { MapFiltersSheet } from '@/components/map-filters-sheet';
import { MapLocationSearch } from '@/components/map-location-search';
import { SzukajTerazSheet } from '@/components/szukaj-teraz-sheet';

import { Brand, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';
import { useUserLocation, type LngLat } from '@/hooks/use-user-location';
import { t } from '@/i18n';
import {
  fieldsToGeoJSON,
  getEventCountsByCategoryInBbox,
  getEventCountsInBbox,
  getFieldsByIds,
  getFieldsInBbox,
  getLockedVoivodeshipBoundaries,
  getVoivodeshipStats,
  lockedVoivodeshipsToGeoJSON,
  voivodeshipsToGeoJSON,
  type Bbox,
  type FieldCategoryCount,
  type FieldEventStats,
  type FieldPoint,
  type FieldSort,
} from '@/lib/fields';
import { listMyFavoriteFieldIds } from '@/lib/favorites';
import { dedupeNearbyFields } from '@/lib/field-dedupe';
import { formatCourtName } from '@/lib/field-display';
import { distanceMeters } from '@/lib/geo';
import { onFieldsPrefetchUpdate } from '@/lib/fields-prefetch';
import { markInitialDiscoverReady } from '@/lib/map-ready';
import {
  buildAvailabilityMatchExpression,
  buildClusterCategoryProperties,
  buildClusterIconSizeExpression,
  buildClusterIconSlotExpression,
  buildClusterIconSlotOffsetExpression,
  buildClusterIconSlotVisibleFilter,
  buildClusterStatusColorExpression,
  BUBBLE_CENTER_COLOR,
} from '@/lib/map-theme';
import { notifyInfo } from '@/lib/toast';
import {
  applyDiscoverFilters,
  countActiveDiscoverFilters,
  DEFAULT_DISCOVER_FILTERS,
  getDiscoverEvents,
  sortDiscoverEvents,
  type DiscoverEvent,
  type DiscoverFilters,
} from '@/lib/discover-events';
import { type CategoryFilter } from '@/lib/event-categories';
import { fieldFilterForSelection } from '@/lib/venue-types';
import type { PlaceSearchResult } from '@/lib/map-geocoding';
import { mapFieldIcons } from '@/lib/map-field-icons';
import {
  bboxAroundCenter,
  expandBbox,
  maxRowsForZoom,
  POLAND_BBOX,
  POLAND_CENTER,
} from '@/lib/map-bbox';
import {
  onFavoritesRefresh,
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
 * Tymczasowo ukryty przycisk FAB "Szukaj teraz" (kolejka dopasowań graczy —
 * SzukajTerazSheet, playNowOpen) — osobna funkcja od przycisku "Szukaj w
 * pobliżu" (NearbyEventsSheet, nearbyEventsOpen) niżej, który POKAZUJE
 * aktywne wydarzenia w promieniu, a nie zapisuje do kolejki. Logika kolejki
 * zostaje nietknięta na wypadek gdyby ten FAB też miał kiedyś wrócić.
 */
const SZUKAJ_TERAZ_BUTTON_VISIBLE = false;
/**
 * Poniżej tego zoomu nie pobieramy pojedynczych boisk — widok obejmuje (prawie)
 * cały kraj, boiska i tak są niewidoczne pod bąblami województw, a zapytanie
 * byłoby ciężkie (seq scan po 56k). Dzięki temu nie ma „delaya" i zacięć przy
 * oddalonym widoku. Ładowanie startuje tuż przed tym, jak boiska zaczynają się
 * wtapiać (FADE_START), więc są gotowe gdy stają się widoczne.
 */
const FIELD_LOAD_MIN_ZOOM = 6.3;
const MAX_BADGE_COUNT = 20;
/** Promień przycisku "Szukaj w pobliżu" — górny limit niezależnie od tego, co
 * akurat jest ustawione w filtrach (ciaśniejszy istniejący filtr odległości
 * i tak wygrywa, patrz nearbyEventsList). */
const NEARBY_EVENTS_RADIUS_KM = 10;
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

/**
 * Kolor klastra ma pokazywać, czy warto tam zajrzeć — nie liczebność grupy.
 * Agregujemy przy łączeniu punktów, ile w klastrze jest boisk w każdym stanie
 * dostępności, a potem wybieramy kolor wg priorytetu: jest coś otwartego? ->
 * zielony (jest gdzie grać); inaczej mało miejsc? -> pomarańczowy; inaczej
 * pełne? -> czerwony; inaczej brak eventów -> szary.
 *
 * Kategorie sportu w klastrze pokazujemy jako siatkę ikon (1/2/3-4/5+, patrz
 * buildClusterCategoryProperties/buildClusterIconSlot* w src/lib/map-theme.ts,
 * dzielone z map-view.web.tsx) — rosnącą razem z bąblem, patrz
 * CLUSTER_SIZE_TIERS w map-theme.ts.
 */
const CLUSTER_AVAILABILITY_PROPERTIES = {
  // Suma AKTYWNYCH EVENTÓW ze wszystkich boisk w klastrze — to jest liczba,
  // która ma się wyświetlać w bąblu, NIE liczba zgrupowanych punktów/boisk.
  total_events: ['+', ['get', 'event_count']],
  open_count: ['+', ['case', ['==', ['get', 'availability'], 'open'], 1, 0]],
  filling_count: ['+', ['case', ['==', ['get', 'availability'], 'filling'], 1, 0]],
  full_count: ['+', ['case', ['==', ['get', 'availability'], 'full'], 1, 0]],
  ...buildClusterCategoryProperties(),
};

type FieldSelection = { rpc: string | null; showFields: boolean };

/** Mapowanie wybranej kategorii/podkategorii na typy obiektów na mapie. */
function fieldSelectionFor(
  category: CategoryFilter,
  subcategory: string | null,
): FieldSelection {
  return fieldFilterForSelection(category, subcategory);
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
    photo_url: typeof props?.photo_url === 'string' ? props.photo_url : null,
    availability:
      props?.availability === 'open' || props?.availability === 'filling' || props?.availability === 'full'
        ? props.availability
        : 'empty',
  };
}

/** getClusterLeaves() zwraca FeatureCollection (web shim) albo samą tablicę (natywne SDK) — obsłuż oba. */
function extractLeafFeatures(result: unknown): GeoJSON.Feature[] {
  if (Array.isArray(result)) return result as GeoJSON.Feature[];
  if (result && typeof result === 'object' && Array.isArray((result as { features?: unknown }).features)) {
    return (result as { features: GeoJSON.Feature[] }).features;
  }
  return [];
}

/** Konwertuje pojedynczą (nie-klastrową) cechę mapy na wiersz panelu "W pobliżu". */
function featureToNearbyItem(
  feature: GeoJSON.Feature,
  coords: LngLat | null,
  categoryBreakdown: Map<string, FieldCategoryCount[]>,
): NearbyFieldItem | null {
  if (feature.geometry?.type !== 'Point') return null;
  const props = (feature.properties ?? {}) as Record<string, unknown>;
  const [lng, lat] = feature.geometry.coordinates;
  const sport = typeof props.sport === 'string' ? props.sport : null;
  const id = String(feature.id ?? props.id ?? '');
  return {
    id,
    name: formatCourtName(typeof props.name === 'string' ? props.name : null, sport),
    sport,
    emoji: typeof props.emoji === 'string' ? props.emoji : '📍',
    distanceMeters: coords ? distanceMeters(coords, [lng, lat]) : null,
    eventCount: Number(props.event_count) || 0,
    availability: (props.availability as NearbyFieldItem['availability']) ?? 'empty',
    eventsByCategory: (categoryBreakdown.get(id) ?? []).map((c) => ({ sport: c.sport, count: c.count })),
  };
}

/** Panel "W pobliżu": tylko boiska do 5 km z otwartymi (dołączalnymi) eventami. */
const NEARBY_MAX_DISTANCE_M = 5000;
function isNearbyListEligible(item: NearbyFieldItem): boolean {
  return (
    item.distanceMeters != null &&
    item.distanceMeters <= NEARBY_MAX_DISTANCE_M &&
    (item.availability === 'open' || item.availability === 'filling')
  );
}

export function AppMap() {
  const insets = useSafeAreaInsets();
  const { status, coords } = useUserLocation();
  const mapRef = useRef<MapView>(null);
  const cameraRef = useRef<Camera>(null);
  const fieldsSourceRef = useRef<ShapeSource>(null);
  const [features, setFeatures] = useState(EMPTY_FEATURES);
  const [voivodeships, setVoivodeships] = useState(EMPTY_VOIVODESHIPS);
  const [lockedRegions, setLockedRegions] = useState(EMPTY_LOCKED_REGIONS);
  const [lockedLabels, setLockedLabels] = useState(EMPTY_VOIVODESHIPS);
  const [selectedField, setSelectedField] = useState<FieldPoint | null>(null);
  const [discoverEvents, setDiscoverEvents] = useState<DiscoverEvent[]>([]);
  const [filters, setFilters] = useState<DiscoverFilters>(DEFAULT_DISCOVER_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [playNowOpen, setPlayNowOpen] = useState(false);
  const [nearbyEventsOpen, setNearbyEventsOpen] = useState(false);
  const [searchedPlace, setSearchedPlace] = useState<PlaceSearchResult | null>(null);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [nearbyExpanded, setNearbyExpanded] = useState(false);
  const [clusterVenues, setClusterVenues] = useState<NearbyFieldItem[] | null>(null);
  const [categoryBreakdown, setCategoryBreakdown] = useState<Map<string, FieldCategoryCount[]>>(new Map());
  const requestIdRef = useRef(0);
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestStateRef = useRef<MapState | undefined>(undefined);
  const fieldsCacheRef = useRef<Map<string, FieldPoint>>(new Map());
  const lastZoomRef = useRef<number | null>(null);
  const fieldTapLockRef = useRef(false);
  const didCenterOnUserRef = useRef(false);

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

  // "Szukaj w pobliżu": te same filtry co reszta mapy (sport, poziom, data...),
  // tylko z dociśniętym promieniem — jeśli użytkownik ma już ustawiony ciaśniejszy
  // filtr odległości, ten wygrywa, inaczej twardy limit NEARBY_EVENTS_RADIUS_KM.
  const nearbyEventsList = useMemo(() => {
    if (!coords) return [];
    const cappedDistanceKm =
      filters.distanceKm != null
        ? Math.min(filters.distanceKm, NEARBY_EVENTS_RADIUS_KM)
        : NEARBY_EVENTS_RADIUS_KM;
    const filtered = applyDiscoverFilters(
      discoverEvents,
      { ...filters, distanceKm: cappedDistanceKm },
      { userCoords: coords },
    );
    return sortDiscoverEvents(filtered, 'distance', coords);
  }, [discoverEvents, filters, coords]);

  const activeFilterCount = useMemo(
    () => countActiveDiscoverFilters(filters),
    [filters],
  );

  // Panel "W pobliżu": ta sama lista boisk co na mapie (features), tylko do 5 km
  // i tylko z otwartymi (dołączalnymi) eventami, posortowana wg odległości.
  const nearbyFields = useMemo<NearbyFieldItem[]>(() => {
    const items = features.features.flatMap((feature) => {
      const item = featureToNearbyItem(feature, coords, categoryBreakdown);
      return item && isNearbyListEligible(item) ? [item] : [];
    });
    items.sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity));
    return items.slice(0, 40);
  }, [features, coords, categoryBreakdown]);

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
      // Wszystkie boiska (z eventami i bez) trafiają do JEDNEJ, wspólnie
      // klastrowanej warstwy — ten sam bąbel dla każdego, obwódka po prostu
      // pokazuje stan: zielona/pomarańczowa/czerwona = dostępność, szara =
      // brak aktywnych eventów. Dzięki temu pobliskie boiska zawsze łączą się
      // w jeden klaster razem, niezależnie od tego, czy akurat mają eventy.
      const merged = new Map(showFields ? cache : new Map<string, FieldPoint>());
      for (const [id, field] of favoriteFieldsRef.current) {
        // Ulubione mają być widoczne ZAWSZE, ale getFieldsByIds() (skąd
        // pochodzą) nie liczy event_count/availability (to osobne zapytanie
        // event_counts_in_bbox) — zawsze zwraca 0/undefined. Jeśli boisko
        // jest już w cache (widoczne w viewport, poprawnie wzbogacone), NIE
        // nadpisujemy go zerem — inaczej ulubione boisko z aktywnym eventem
        // "gasło" na mapie za każdym razem, gdy ulubione się odświeżały.
        if (!merged.has(id)) merged.set(id, field);
      }
      const enriched = [...merged.values()].map((field) => {
        const players = fieldPlayersMap.get(field.id);
        return { ...field, players_current: players?.current ?? 0, players_max: players?.max ?? null };
      });
      // Scalanie na PEŁNYM, zebranym zestawie (nie tylko świeżo pobranej paczce) —
      // dwa boiska bliżej niż próg mogły dojechać z osobnych zapytań bbox przy
      // przesuwaniu mapy i inaczej nigdy by się nie spotkały w jednym wywołaniu
      // dedupeNearbyFields, zostając jako dwa trwałe, sąsiadujące bąble.
      setFeatures(fieldsToGeoJSON(dedupeNearbyFields(enriched)));
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
      const [fieldsRes, countsRes, categoryCountsRes] = await Promise.all([
        getFieldsInBbox(padded, maxRowsForZoom(mapZoom), sportFilter, FIELD_SORT),
        getEventCountsInBbox(padded, sportFilter),
        getEventCountsByCategoryInBbox(padded),
      ]);
      if (fieldsRes.error || requestId !== requestIdRef.current) {
        if (requestId === requestIdRef.current) setFieldsLoading(false);
        return;
      }

      if (!categoryCountsRes.error) {
        setCategoryBreakdown(categoryCountsRes.data);
      }
      const counts = countsRes.error ? new Map<string, FieldEventStats>() : countsRes.data;
      const merged = fieldsRes.data.map((field) => {
        const stats = counts.get(field.id);
        return { ...field, event_count: stats?.event_count ?? 0, availability: stats?.availability };
      });
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
    const unsubFavorites = onFavoritesRefresh(() => {
      void loadFavoriteFields().then(() => publishFeatures(fieldsCacheRef.current));
    });
    return () => {
      unsubCount();
      unsubRefresh();
      unsubFavorites();
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

  // Zanim ten efekt w ogóle zdąży pobrać dane dla dokładnego viewportu, cache
  // może już być zasiedlony przez preładowanie startowe z _layout.tsx (patrz
  // efekt niżej) — sygnał "gotowości" splasha należy właśnie do tamtego
  // modułu, więc tutaj już go nie duplikujemy. Brak sztucznego opóźnienia:
  // ta sama logika co wcześniej (800ms czekania na coords), tylko odpalana
  // od razu z tym, co akurat jest dostępne — efekt i tak przeliczy się
  // ponownie, gdy `center`/`coords` dojdą chwilę później.
  useEffect(() => {
    const wideBbox = coords
      ? expandBbox(bboxAroundCenter(center, USER_ZOOM), 1.4)
      : POLAND_BBOX;
    void loadFields(wideBbox, coords ? USER_ZOOM : DEFAULT_ZOOM);
    return () => {
      if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
    };
  }, [center, coords, loadFields]);

  // Preładowanie z _layout.tsx (patrz src/lib/fields-prefetch.ts) daje
  // natychmiastowy pierwszy render boisk — z dysku przy kolejnych otwarciach
  // apki, ze świeżej sieci przy pierwszym. Jak tylko efekt powyżej opublikuje
  // cokolwiek własnego (dokładniejszego, bo wg realnego viewportu), przestajemy
  // nadpisywać — to preładowanie służy wyłącznie do pierwszego malowania.
  useEffect(() => {
    if (!showFields) return;
    return onFieldsPrefetchUpdate((prefetched) => {
      if (fieldsCacheRef.current.size > 0) return;
      fieldsCacheRef.current = new Map(prefetched.map((f) => [f.id, f]));
      publishFeatures(fieldsCacheRef.current);
    });
  }, [showFields, publishFeatures]);

  useEffect(() => {
    fieldsCacheRef.current.clear();
    void loadVisibleFields(latestStateRef.current);
  }, [showFields, sportFilter, loadVisibleFields]);

  const onFieldPress = useCallback(
    (event: { features?: GeoJSON.Feature[] }) => {
      const feature = event.features?.[0];
      if (!feature) return;

      // Tap w grupę (cluster) -> NIE przybliżamy i nie otwieramy losowego boiska —
      // pokazujemy listę obiektów z tego klastra w panelu "W pobliżu" (pinch/scroll
      // zoom nadal naturalnie rozdziela klaster dzięki wbudowanemu group'owaniu GL).
      if (feature.properties?.point_count != null) {
        fieldTapLockRef.current = true;
        setTimeout(() => {
          fieldTapLockRef.current = false;
        }, 0);
        void fieldsSourceRef.current
          ?.getClusterLeaves(feature, 200, 0)
          .then((collection) => {
            const leaves = extractLeafFeatures(collection);
            const items = leaves.flatMap((leaf) => {
              const item = featureToNearbyItem(leaf, coords, categoryBreakdown);
              return item && isNearbyListEligible(item) ? [item] : [];
            });
            items.sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity));
            setClusterVenues(items);
            setNearbyExpanded(true);
          })
          .catch(() => {});
        return;
      }

      const field = fieldFromMapFeature(feature);
      if (!field) return;

      fieldTapLockRef.current = true;
      setClusterVenues(null);
      setSelectedField(field);
      setTimeout(() => {
        fieldTapLockRef.current = false;
      }, 0);
    },
    [coords, categoryBreakdown],
  );

  const onMapPress = useCallback(() => {
    if (fieldTapLockRef.current) return;
    setSelectedField(null);
    setClusterVenues(null);
  }, []);

  const onSelectNearby = useCallback(
    (id: string) => {
      const feature = features.features.find((f) => String(f.id ?? f.properties?.id) === id);
      if (!feature) return;
      const field = fieldFromMapFeature(feature);
      if (!field) return;
      setNearbyExpanded(false);
      setClusterVenues(null);
      setSelectedField(field);
    },
    [features],
  );

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

  // Zanim jest jakikolwiek fetch dla widocznego obszaru (ani preładowanie, ani
  // bbox), panel "W pobliżu" pokazuje szkielet zamiast nic — więc elementy
  // skumulowane nad nim (wyszukiwarka, "Szukaj teraz" FAB) muszą liczyć
  // clearance względem JEGO wysokości, nie tylko względem zwiniętego panelu
  // z prawdziwymi danymi.
  const nearbySkeletonVisible = showFields && fieldsLoading && features.features.length === 0;
  const nearbyClearance =
    nearbyFields.length > 0
      ? NEARBY_SHEET_COLLAPSED_HEIGHT + 12
      : nearbySkeletonVisible
        ? NEARBY_SHEET_SKELETON_HEIGHT + 12
        : null;

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

        <ShapeSource
          ref={fieldsSourceRef}
          id="fields"
          shape={features}
          onPress={onFieldPress}
          cluster
          clusterRadius={80}
          // Poza tym zoomem Mapbox przestaje w ogóle liczyć klastry — każdy punkt
          // renderuje się osobno, nawet gdy leży kilkadziesiąt metrów od sąsiada.
          // 13 było za nisko (widać było pojedyncze markery obok dużego klastra
          // przy przybliżeniu, w którym powinny się jeszcze łączyć).
          clusterMaxZoomLevel={16}
          clusterProperties={CLUSTER_AVAILABILITY_PROPERTIES}>
          {/* Neonowa poświata klastra — kolor wg najlepszej dostępności (jest tu coś
              otwartego? -> zielony; inaczej mało miejsc? -> pomarańczowy; inaczej
              pełne? -> czerwony; inaczej brak danych -> szary, bez neonu). */}
          <CircleLayer
            id="clusters-halo"
            filter={['has', 'point_count']}
            minZoomLevel={FADE_START}
            style={{
              circleRadius: [
                'interpolate',
                ['linear'],
                ['get', 'total_events'],
                1, 30,
                5, 34,
                15, 38,
                40, 44,
              ],
              circleColor: buildClusterStatusColorExpression(),
              circleBlur: 1.1,
              circleOpacity: ['interpolate', ['linear'], ['zoom'], FADE_START, 0, FADE_END, 0.6],
            }}
          />
          {/* Ciemny/niemal czarny środek klastra — jak w referencji, NIE wypełniony
              kolorem dostępności. Rozmiar zależy od zoomu, więc rośnie płynnie
              w miarę przybliżania, zamiast "skakać" skokowo między wartościami. */}
          <CircleLayer
            id="clusters"
            filter={['has', 'point_count']}
            minZoomLevel={FADE_START}
            style={{
              circleRadius: [
                'interpolate',
                ['linear'],
                ['get', 'total_events'],
                1, 24,
                5, 28,
                15, 32,
                40, 38,
              ],
              circleColor: BUBBLE_CENTER_COLOR,
              circleOpacity: ['interpolate', ['linear'], ['zoom'], FADE_START, 0, FADE_END, 1],
              circleStrokeWidth: [
                'interpolate',
                ['linear'],
                ['zoom'],
                FADE_START, 3,
                13, 5,
              ],
              circleStrokeColor: buildClusterStatusColorExpression(),
              circleStrokeOpacity: ['interpolate', ['linear'], ['zoom'], FADE_START, 0, FADE_END, 1],
            }}
          />
          <SymbolLayer
            id="cluster-count"
            filter={['has', 'point_count']}
            minZoomLevel={FADE_START}
            style={{
              textField: ['get', 'total_events'],
              textSize: ['interpolate', ['linear'], ['zoom'], FADE_START, 13, 10, 16, 13, 19],
              textColor: '#ffffff',
              textOffset: [0, -0.95],
              textAllowOverlap: true,
              textIgnorePlacement: true,
              textPitchAlignment: 'viewport',
            }}
          />
          {/* Siatka ikon kategorii pod liczbą — stała, deterministyczna geometria
              (patrz CLUSTER_SIZE_TIERS w map-theme.ts): 1 wyśrodkowana, 2 obok
              siebie, 3-4 w układzie 2x2, 5+ -> pierwsze 3 + piktogram "more".
              Rozmiar rośnie razem z bąblem (więcej eventów w klastrze ->
              większy bąbel -> większe ikony). Wszystkie 4 warstwy dzielą
              DOKŁADNIE ten sam styl iconSize, więc ikony w jednym bąblu
              zawsze mają identyczny rozmiar. */}
          <>
            {([0, 1, 2, 3] as const).map((slot) => (
              <SymbolLayer
                key={`cluster-icon-slot-${slot}`}
                id={`cluster-icon-slot-${slot}`}
                filter={['all', ['has', 'point_count'], buildClusterIconSlotVisibleFilter(slot)]}
                minZoomLevel={FADE_START}
                style={{
                  iconImage: buildClusterIconSlotExpression(slot),
                  iconSize: buildClusterIconSizeExpression(),
                  iconOffset: buildClusterIconSlotOffsetExpression(slot),
                  iconAllowOverlap: true,
                  iconIgnorePlacement: true,
                  iconPitchAlignment: 'viewport',
                }}
              />
            ))}
          </>
          {/* Miękka poświata obiektu — kolor wg dostępności (jak klaster), nie wg
              liczby eventów, żeby jeden spójny język wizualny opisywał "czy warto". */}
          <CircleLayer
            id="fields-glow"
            filter={['!', ['has', 'point_count']]}
            minZoomLevel={FADE_START}
            style={{
              circleRadius: [
                'interpolate',
                ['linear'],
                ['zoom'],
                7, 18,
                12, 26,
                14, 32,
                16, 38,
                18, 44,
              ],
              circleColor: buildAvailabilityMatchExpression(),
              circleBlur: 1.1,
              circleOpacity: 0.55,
            }}
          />
          {/* Gruby, mocno widoczny pierścień dostępności + niemal czarny środek —
              ten sam język co klaster: ciemny środek, gruba kolorowa obwódka.
              Ten sam wygląd dla każdego stanu (włącznie z szarym "brak eventów") —
              obwódka po prostu komunikuje inny kolor, nie inny poziom istnienia. */}
          <CircleLayer
            id="fields-ring"
            filter={['!', ['has', 'point_count']]}
            minZoomLevel={FADE_START}
            style={{
              circleRadius: [
                'interpolate',
                ['linear'],
                ['zoom'],
                7, 12,
                12, 18,
                14, 22,
                16, 26,
                18, 30,
              ],
              circleColor: BUBBLE_CENTER_COLOR,
              circleOpacity: 1,
              circleStrokeWidth: [
                'interpolate',
                ['linear'],
                ['zoom'],
                7, 3,
                14, 4,
                18, 5,
              ],
              circleStrokeColor: buildAvailabilityMatchExpression(),
              circleStrokeOpacity: ['interpolate', ['linear'], ['zoom'], FADE_START, 0, FADE_END, 1],
            }}
          />
          {/* Ikonka sportu, obok liczby eventów — obrazek, bo Mapbox nie renderuje
              emoji w warstwie tekstu (gł. Android). */}
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
                7, 0.3,
                12, 0.4,
                14, 0.46,
                16, 0.54,
                18, 0.62,
              ],
              iconOffset: [-11, 0],
              iconAllowOverlap: true,
              iconIgnorePlacement: true,
              iconPitchAlignment: 'viewport',
            }}
          />
          {/* Liczba AKTYWNYCH EVENTÓW na tym konkretnym boisku, obok ikony —
              to jest to, co user ma widzieć od razu, nie licznik graczy jednego eventu. */}
          <SymbolLayer
            id="fields-count-text"
            filter={['!', ['has', 'point_count']]}
            minZoomLevel={FADE_START}
            style={{
              textField: ['get', 'event_count'],
              textSize: [
                'interpolate',
                ['linear'],
                ['zoom'],
                7, 12,
                12, 15,
                14, 17,
                16, 19,
                18, 21,
              ],
              textColor: '#ffffff',
              textOffset: [0.75, 0],
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
        <Pressable
          onPress={() => setNearbyEventsOpen(true)}
          style={({ pressed }) => [
            styles.nearbySearchBtn,
            { top: insets.top + 68 },
            pressed && styles.nearbySearchBtnPressed,
          ]}>
          <Text style={styles.nearbySearchBtnIcon}>📍</Text>
          <Text style={styles.nearbySearchBtnText}>{t('map.nearbySearchButton')}</Text>
        </Pressable>
      ) : null}

      <NearbyEventsSheet
        visible={nearbyEventsOpen}
        onClose={() => setNearbyEventsOpen(false)}
        events={nearbyEventsList}
        userCoords={coords}
        onSelectEvent={(event) => {
          setNearbyEventsOpen(false);
          router.push({ pathname: '/event/[id]', params: { id: event.id } });
        }}
      />

      {!selectedField ? (
        <MapPlaySearchBar
          bottomOffset={insets.bottom + BOTTOM_NAV_HEIGHT + (nearbyClearance ?? 12)}
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

      {SZUKAJ_TERAZ_BUTTON_VISIBLE && !selectedField && !nearbyExpanded ? (
        <Pressable
          onPress={() => setPlayNowOpen(true)}
          style={({ pressed }) => [
            styles.playNowFab,
            {
              bottom: insets.bottom + BOTTOM_NAV_HEIGHT + (nearbyClearance ?? 24),
            },
            pressed && styles.playNowFabPressed,
          ]}>
          <Text style={styles.playNowFabText}>🔎 {t('playNow.button')}</Text>
        </Pressable>
      ) : null}

      {!selectedField ? (
        <MapNearbySheet
          fields={clusterVenues ?? nearbyFields}
          onSelect={onSelectNearby}
          expanded={nearbyExpanded}
          onToggleExpanded={() =>
            setNearbyExpanded((v) => {
              if (v) setClusterVenues(null);
              return !v;
            })
          }
          bottomOffset={insets.bottom + BOTTOM_NAV_HEIGHT}
          loading={nearbySkeletonVisible}
        />
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
    backgroundColor: Brand.success,
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
  nearbySearchBtn: {
    position: 'absolute',
    right: 14,
    zIndex: 27,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.pill,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
    ...shadow('float'),
  },
  nearbySearchBtnPressed: {
    opacity: 0.9,
  },
  nearbySearchBtnIcon: {
    fontSize: 14,
  },
  nearbySearchBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Brand.textPrimary,
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
