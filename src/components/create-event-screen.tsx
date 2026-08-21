import Mapbox, {
  Camera,
  CircleLayer,
  FillLayer,
  Images,
  LineLayer,
  MapView,
  MarkerView,
  ShapeSource,
  SymbolLayer,
  type MapState,
} from '@rnmapbox/maps';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DatePickerField } from '@/components/date-picker-field';
import { TimePickerField } from '@/components/time-picker-field';
import { Brand, BrandFonts, Layout, Radius } from '@/constants/theme';
import { notifyError, notifyInfo } from '@/lib/toast';
import { shadow, Typography } from '@/constants/ui';
import { useSession } from '@/context/session';
import { useUserLocation } from '@/hooks/use-user-location';
import { t } from '@/i18n';
import {
  CATEGORY_META,
  categoryLabel,
  markerEmoji,
  subcategoriesFor,
  subcategoryLabel,
  type EventCategory,
} from '@/lib/event-categories';
import { defaultEventStart, parseLocalDateTime, toDateInput, toTimeInput } from '@/lib/datetime';
import { createDiscoverEvent } from '@/lib/discover-events';
import type { SkillLevel } from '@/lib/event-filters';
import {
  fieldFromMapFeature,
  fieldsToGeoJSON,
  getFieldsInBbox,
  getLockedVoivodeshipBoundaries,
  lockedVoivodeshipsToGeoJSON,
  type FieldPoint,
} from '@/lib/fields';
import { uploadEventImage } from '@/lib/event-storage';
import { formatCourtName, formatFieldTitle } from '@/lib/field-display';
import {
  bboxAroundCenter,
  expandBbox,
  isWithinTricity,
  maxRowsForZoom,
  POLAND_BBOX,
  POLAND_CENTER,
} from '@/lib/map-bbox';
import type { Bbox } from '@/lib/fields';
import { reverseGeocode, searchMapPlaces, type PlaceSearchResult } from '@/lib/map-geocoding';
import { requireLocationPermission } from '@/lib/location-permission';
import { fieldTypesForSelection, eventSubcategoryForFieldSport, fieldSportMatchesEvent } from '@/lib/venue-types';
import { mapBubbleIcons } from '@/lib/map-bubble-icons';
import {
  BUBBLE_CENTER_COLOR,
  buildClusterCategoryProperties,
  buildClusterIconSizeExpression,
  buildClusterIconSlotExpression,
  buildClusterIconSlotOffsetExpression,
  buildClusterIconSlotVisibleFilter,
} from '@/lib/map-theme';
import { pickImagesFromLibrary, type PickedImage } from '@/lib/pick-image';
import type { LngLat } from '@/hooks/use-user-location';

const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
if (token) {
  Mapbox.setAccessToken(token);
}

type StepId = 'category' | 'subcategory' | 'location' | 'details' | 'summary';

type ChosenLocation = {
  center: LngLat;
  name: string;
  fieldId: string | null;
  fieldSport?: string | null;
};

/** Prostokąt widocznego obszaru mapy (z bounds, a w razie braku z centrum+zoomu). */
function bboxFromMapState(state: MapState | undefined): { bbox: Bbox; zoom: number } | null {
  const zoom = state?.properties?.zoom ?? 6;
  const bounds = state?.properties?.bounds;
  if (bounds?.ne && bounds?.sw) {
    const [maxLng, maxLat] = bounds.ne;
    const [minLng, minLat] = bounds.sw;
    return { bbox: { minLng, minLat, maxLng, maxLat }, zoom };
  }
  const center = state?.properties?.center;
  if (center && center.length >= 2) {
    return { bbox: bboxAroundCenter([center[0], center[1]], zoom), zoom };
  }
  return null;
}

type CreateEventScreenProps = {
  /** Onboarding "próbny event": prowadzi przez ten sam formularz, ale
   * handleSubmit nigdy nie wywołuje createDiscoverEvent ani nie nawiguje —
   * zamiast tego woła onDemoSubmit, żeby wywołujący (onboarding wizard) mógł
   * pokazać własny ekran "to był tylko pokaz". Patrz src/app/(onboarding). */
  demoMode?: boolean;
  onDemoSubmit?: () => void;
  /** Cofnięcie z pierwszego kroku w demoMode wraca do poprzedniego slajdu
   * onboardingu zamiast router.back() (nie ma dokąd wracać w tym stacku). */
  onDemoExit?: () => void;
};

export default function CreateEventScreen({
  demoMode = false,
  onDemoSubmit,
  onDemoExit,
}: CreateEventScreenProps = {}) {
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const { coords } = useUserLocation();
  const userId = session?.user?.id;

  const start = defaultEventStart();

  // Wstępnie wybrane miejsce, gdy wchodzimy z mapy (klik w boisko).
  const params = useLocalSearchParams<{
    fieldId?: string;
    fieldName?: string;
    fieldSport?: string;
    fieldLng?: string;
    fieldLat?: string;
  }>();
  const presetField = useMemo(() => {
    const lng = Number(params.fieldLng);
    const lat = Number(params.fieldLat);
    if (!params.fieldId || !Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    const sport = params.fieldSport?.trim() || null;
    const sub =
      sport && subcategoriesFor('sport').some((s) => s.id === sport) ? sport : null;
    return {
      id: params.fieldId,
      sport,
      subcategory: sub,
      center: [lng, lat] as LngLat,
      name: formatCourtName(params.fieldName ?? null, sport),
    };
  }, [params.fieldId, params.fieldName, params.fieldSport, params.fieldLng, params.fieldLat]);

  const lockedSubcategory = useMemo(() => {
    if (presetField?.subcategory) return presetField.subcategory;
    if (presetField?.sport) return eventSubcategoryForFieldSport(presetField.sport);
    return null;
  }, [presetField]);

  const fieldSportLocked = Boolean(presetField && lockedSubcategory);

  const [stepId, setStepId] = useState<StepId>(fieldSportLocked ? 'location' : 'subcategory');
  // Apka skupia się wyłącznie na Sporcie (patrz DEFAULT_DISCOVER_FILTERS) — kategoria
  // jest zawsze 'sport', krok jej wyboru został ukryty.
  const [category, setCategory] = useState<EventCategory | null>('sport');
  const [subcategory, setSubcategory] = useState<string | null>(
    presetField?.subcategory ?? null,
  );

  const [title, setTitle] = useState('');
  const [date, setDate] = useState(toDateInput(start));
  const [startTime, setStartTime] = useState(toTimeInput(start));
  const [endTime, setEndTime] = useState('');
  const [notes, setNotes] = useState('');
  const [descriptionLong, setDescriptionLong] = useState('');
  const [organizerName, setOrganizerName] = useState('');
  const [organizerContact, setOrganizerContact] = useState('');
  const [organizerUrl, setOrganizerUrl] = useState('');
  const [maxPlayers, setMaxPlayers] = useState('');
  const [isPaid, setIsPaid] = useState(false);
  const [price, setPrice] = useState('');
  const [skillLevel, setSkillLevel] = useState<SkillLevel>('any');
  const [images, setImages] = useState<PickedImage[]>([]);

  const [location, setLocation] = useState<ChosenLocation | null>(
    presetField
      ? {
          center: presetField.center,
          name: presetField.name,
          fieldId: presetField.id,
          fieldSport: presetField.sport,
        }
      : null,
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFields, setCategoryFields] = useState<FieldPoint[]>([]);
  const [searchResults, setSearchResults] = useState<PlaceSearchResult[] | null>(null);
  const [loadingPlaces, setLoadingPlaces] = useState(false);
  // Szara blokada poza Trójmiastem — ta sama, co na głównej mapie (patrz
  // map-view.tsx), bo tu też wybiera się lokalizację, którą i tak serwer
  // odrzuci poza Trójmiastem (isWithinTricity walidacja niżej) — użytkownik
  // ma to widzieć OD RAZU na mapie wyboru, a nie dopiero po błędzie.
  const [lockedRegions, setLockedRegions] = useState<GeoJSON.FeatureCollection>({
    type: 'FeatureCollection',
    features: [],
  });

  const [stepError, setStepError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mapFull, setMapFull] = useState(false);
  // Mniej ważne pola (krótki/pełny opis, płatność, organizator) chowamy pod „więcej".
  const [moreOpen, setMoreOpen] = useState(false);
  // Tryb ustawiania własnej pinezki — dotknięcie mapy stawia punkt TYLKO gdy włączony.
  const [customPointMode, setCustomPointMode] = useState(false);

  const cameraRef = useRef<Camera>(null);
  const fullCameraRef = useRef<Camera>(null);
  const centerRef = useRef<LngLat>(coords ?? POLAND_CENTER);
  const zoomRef = useRef<number>(6);
  const latestStateRef = useRef<MapState | undefined>(undefined);
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const fieldTapLockRef = useRef(false);
  const didCenterOnUserRef = useRef(false);

  const subcats = category ? subcategoriesFor(category) : [];

  // Punkty (boiska/obiekty) z całej Polski dopasowane do kategorii — jako GeoJSON do klastrowania.
  const fieldFeatures = useMemo(() => fieldsToGeoJSON(categoryFields), [categoryFields]);

  // Kolejność kroków: krok podkategorii pomijamy, gdy kategoria jej nie ma
  // lub gdy dyscyplina wynika z wybranego boiska.
  const steps = useMemo<StepId[]>(() => {
    const list: StepId[] = [];
    if (!fieldSportLocked && subcats.length > 0) list.push('subcategory');
    list.push('location', 'details', 'summary');
    return list;
  }, [fieldSportLocked, subcats.length]);

  useEffect(() => {
    if (fieldSportLocked && lockedSubcategory) {
      setCategory('sport');
      setSubcategory(lockedSubcategory);
    }
  }, [fieldSportLocked, lockedSubcategory]);

  useEffect(() => {
    let active = true;
    void getLockedVoivodeshipBoundaries('pomorskie').then(({ data, error }) => {
      if (active && !error && data.length > 0) {
        setLockedRegions(lockedVoivodeshipsToGeoJSON(data));
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const onLockedRegionPress = useCallback(() => {
    notifyInfo(`🔒 ${t('map.comingSoon')}`);
  }, []);

  const stepIndex = Math.max(0, steps.indexOf(stepId));
  const totalSteps = steps.length;

  const sportFilter = useMemo(() => {
    const types = fieldTypesForSelection(category, subcategory);
    return types.length > 0 ? types.join(',') : null;
  }, [category, subcategory]);

  // Ładuje obiekty dla widocznego obszaru mapy (jak na głównej mapie) wg kategorii.
  const loadFieldsForBbox = useCallback(
    async (bbox: Bbox, mapZoom: number) => {
      if (!sportFilter) {
        setCategoryFields([]);
        return;
      }
      const requestId = ++requestIdRef.current;
      setLoadingPlaces(true);
      const { data, error } = await getFieldsInBbox(
        expandBbox(bbox, 1.4),
        maxRowsForZoom(mapZoom),
        sportFilter,
        'default',
      );
      if (requestId !== requestIdRef.current) return;
      setLoadingPlaces(false);
      if (!error) setCategoryFields(data);
    },
    [sportFilter],
  );

  const runLoadNow = useCallback(() => {
    if (loadTimerRef.current) {
      clearTimeout(loadTimerRef.current);
      loadTimerRef.current = null;
    }
    const fromState = bboxFromMapState(latestStateRef.current);
    if (fromState) {
      void loadFieldsForBbox(fromState.bbox, fromState.zoom);
      return;
    }
    // Pierwsze wczytanie zanim mapa zgłosi swój stan — wokół użytkownika/Polski.
    const center = location?.center ?? coords ?? POLAND_CENTER;
    const zoom = location || coords ? 11 : 6;
    void loadFieldsForBbox(
      coords || location ? bboxAroundCenter(center, zoom) : POLAND_BBOX,
      zoom,
    );
  }, [loadFieldsForBbox, location, coords]);

  // Po wejściu w krok lokalizacji / zmianie kategorii — odśwież obiekty.
  useEffect(() => {
    if (stepId !== 'location') return;
    runLoadNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepId, sportFilter]);

  // Po wejściu w krok lokalizacji ustaw kamerę na sensowny widok (Polska/okolica/wybór),
  // bo defaultSettings mapy bywa pomijane i mapa lądowała na „oceanie" [0,0].
  useEffect(() => {
    if (stepId !== 'location') return;
    const center = location?.center ?? coords ?? POLAND_CENTER;
    const zoom = location ? 14 : coords ? 11 : 6;
    const id = setTimeout(() => {
      cameraRef.current?.setCamera({ centerCoordinate: center, zoomLevel: zoom, animationDuration: 0 });
    }, 60);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepId]);

  // Kamera ustawia się raz (defaultSettings). Gdy lokalizacja użytkownika dojdzie
  // już po zamontowaniu mapy, jednorazowo (i tylko gdy nic nie wybrano) płynnie
  // przesuwamy widok na użytkownika — bez „cofania" przy każdym renderze.
  useEffect(() => {
    if (didCenterOnUserRef.current || location || !coords) return;
    didCenterOnUserRef.current = true;
    cameraRef.current?.setCamera({ centerCoordinate: coords, zoomLevel: 11, animationDuration: 600 });
  }, [coords, location]);

  // Po otwarciu pełnoekranowej mapy ustawiamy kamerę na aktualny widok/wybór.
  // defaultSettings nowej kamery w modalu bywa pomijane (mapa lądowała na „oceanie"),
  // więc centrujemy imperatywnie tuż po zamontowaniu.
  useEffect(() => {
    if (!mapFull) return;
    const center = location?.center ?? centerRef.current ?? coords ?? POLAND_CENTER;
    const zoom = location ? 15 : zoomRef.current && zoomRef.current > 3 ? zoomRef.current : coords ? 11 : 6;
    const id = setTimeout(() => {
      fullCameraRef.current?.setCamera({
        centerCoordinate: center,
        zoomLevel: zoom,
        animationDuration: 0,
      });
    }, 60);
    return () => clearTimeout(id);
  }, [mapFull, location, coords]);

  const handleAddImages = useCallback(async () => {
    const picked = await pickImagesFromLibrary(8);
    if (picked.length > 0) {
      setImages((prev) => [...prev, ...picked].slice(0, 8));
    }
  }, []);

  const removeImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Podczas ruchu mapy tylko zapamiętujemy stan (bez zapytań) — płynność.
  const onCameraChanged = useCallback((state: MapState) => {
    latestStateRef.current = state;
    const c = state.properties?.center;
    if (c && c.length >= 2) {
      centerRef.current = [c[0], c[1]];
    }
    const z = state.properties?.zoom;
    if (typeof z === 'number') zoomRef.current = z;
  }, []);

  // Dopiero gdy mapa się zatrzyma, dociągamy obiekty dla widoku (lekko opóźnione).
  const onMapIdle = useCallback(
    (state: MapState) => {
      latestStateRef.current = state;
      if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
      loadTimerRef.current = setTimeout(() => runLoadNow(), 120);
    },
    [runLoadNow],
  );

  // Dotknięcie mapy stawia własny punkt TYLKO w trybie „własny punkt".
  // Dzięki temu zwykłe klikanie/zoomowanie mapy nie zaznacza przypadkowo lokalizacji.
  const onMapPress = useCallback(
    async (feature: GeoJSON.Feature) => {
      if (!customPointMode || fieldTapLockRef.current) return;
      const coordinate =
        feature.geometry?.type === 'Point' ? (feature.geometry.coordinates as number[]) : null;
      if (!coordinate || coordinate.length < 2) return;
      const center: LngLat = [coordinate[0], coordinate[1]];
      centerRef.current = center;
      setLocation({ center, name: '', fieldId: null });
      setStepError(null);
      const name = await reverseGeocode(center);
      setLocation((prev) =>
        prev && prev.fieldId === null ? { ...prev, name: name ?? prev.name } : prev,
      );
    },
    [customPointMode],
  );

  // Wyszukiwarka służy TYLKO do namierzenia miasta/ulicy — przesuwa mapę, nie ustawia miejsca.
  const runSearch = useCallback(async (q: string) => {
    setSearchQuery(q);
    if (q.trim().length < 2) {
      setSearchResults(null);
      return;
    }
    const { data } = await searchMapPlaces(q);
    setSearchResults(data);
  }, []);

  function flyTo(center: LngLat, zoom: number) {
    centerRef.current = center;
    cameraRef.current?.setCamera({ centerCoordinate: center, zoomLevel: zoom, animationDuration: 600 });
    fullCameraRef.current?.setCamera({
      centerCoordinate: center,
      zoomLevel: zoom,
      animationDuration: 600,
    });
  }

  function selectCity(result: PlaceSearchResult) {
    flyTo(result.center, 12);
    setSearchQuery(result.label);
    setSearchResults(null);
  }

  const selectField = useCallback(
    (fp: FieldPoint) => {
      if (fp.sport && !fieldSportMatchesEvent(fp.sport, category, subcategory)) {
        setStepError(t('createEvent.errFieldSportMismatch'));
        return;
      }

      const center: LngLat = [fp.lng, fp.lat];
      setLocation({
        center,
        name: formatFieldTitle({ osmName: fp.name, sport: fp.sport }),
        fieldId: fp.id,
        fieldSport: fp.sport,
      });
      centerRef.current = center;
      setStepError(null);
      setCustomPointMode(false);
      setMapFull(false);
      cameraRef.current?.setCamera({ centerCoordinate: center, zoomLevel: 15, animationDuration: 500 });
      fullCameraRef.current?.setCamera({
        centerCoordinate: center,
        zoomLevel: 15,
        animationDuration: 500,
      });
    },
    [category, subcategory],
  );

  const onFieldPress = useCallback(
    (e: { features?: GeoJSON.Feature[] }) => {
      const feature = e.features?.[0];
      if (!feature) return;
      // Blokujemy onMapPress, aby tap w znacznik nie ustawił też własnego punktu.
      fieldTapLockRef.current = true;
      setTimeout(() => {
        fieldTapLockRef.current = false;
      }, 400);
      const props = (feature.properties ?? {}) as Record<string, unknown>;
      const coords =
        feature.geometry?.type === 'Point' ? (feature.geometry.coordinates as number[]) : null;
      // Klaster → przybliżamy; pojedynczy obiekt → wybieramy.
      if (props.point_count || props.cluster) {
        if (coords && coords.length >= 2) {
          const target = Math.min((zoomRef.current ?? 6) + 2.5, 16);
          const cam = mapFull ? fullCameraRef : cameraRef;
          cam.current?.setCamera({
            centerCoordinate: [coords[0], coords[1]],
            zoomLevel: target,
            animationDuration: 500,
          });
        }
        return;
      }
      const fp = fieldFromMapFeature(feature);
      if (fp) selectField(fp);
    },
    [mapFull, selectField],
  );

  function validateStep(id: StepId): string | null {
    if (id === 'subcategory' && subcats.length > 0 && !subcategory)
      return t('createEvent.errSubcategory');
    if (id === 'location' && !location) return t('createEvent.errLocation');
    if (id === 'location' && location && !isWithinTricity(location.center)) {
      return t('createEvent.errLocationOutsideTricity');
    }
    if (
      id === 'location' &&
      location?.fieldSport &&
      !fieldSportMatchesEvent(location.fieldSport, category, subcategory)
    ) {
      return t('createEvent.errFieldSportMismatch');
    }
    if (id === 'details') {
      if (title.trim().length < 3) return t('createEvent.errTitle');
      const startsAt = parseLocalDateTime(date, startTime);
      if (!startsAt) return t('createEvent.errDate');
      if (new Date(startsAt).getTime() < Date.now()) return t('createEvent.errPast');
      if (endTime.trim()) {
        const endsAt = parseLocalDateTime(date, endTime);
        if (!endsAt) return t('createEvent.errEndTime');
        const diff = (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000;
        if (diff < 15) return t('createEvent.errEndTooSoon');
      }
      if (maxPlayers.trim()) {
        const n = Number(maxPlayers);
        if (!Number.isInteger(n) || n < 2) return t('createEvent.errMaxPlayers');
      }
      if (isPaid) {
        const raw = price.replace(',', '.').trim();
        const p = Number(raw);
        if (!raw || !Number.isFinite(p) || p <= 0) return t('createEvent.errPrice');
      }
    }
    return null;
  }

  function goNext() {
    const err = validateStep(stepId);
    if (err) {
      // Gdy błąd dotyczy pól ukrytych pod „więcej", rozwijamy je.
      if (stepId === 'details') setMoreOpen(true);
      setStepError(err);
      return;
    }
    setStepError(null);
    const next = steps[stepIndex + 1];
    if (next) setStepId(next);
  }

  function goBack() {
    setStepError(null);
    if (stepIndex <= 0) {
      if (demoMode) {
        onDemoExit?.();
        return;
      }
      router.back();
      return;
    }
    const prev = steps[stepIndex - 1];
    if (prev) setStepId(prev);
  }

  function selectSubcategory(sub: string) {
    if (fieldSportLocked) return;
    setSubcategory(sub);
    setStepError(null);
    setStepId('location');
  }

  async function handleSubmit() {
    if (!userId) {
      notifyError(t('createEvent.mustLogin'));
      return;
    }
    const locationAllowed = await requireLocationPermission({
      title: t('createEvent.locationRequiredTitle'),
      message: t('createEvent.locationRequiredMessage'),
      settingsLabel: t('settings.open'),
      cancelLabel: t('common.cancel'),
    });
    if (!locationAllowed) return;
    // Pełna walidacja wszystkich kroków przed publikacją.
    for (const id of steps) {
      const err = validateStep(id);
      if (err) {
        setStepId(id);
        setStepError(err);
        return;
      }
    }
    if (!category || !location) return;

    const startsAt = parseLocalDateTime(date, startTime);
    if (!startsAt) {
      setStepId('details');
      setStepError(t('createEvent.errDate'));
      return;
    }

    if (demoMode) {
      // Próbny event z onboardingu: pełna walidacja powyżej już przeszła,
      // ale świadomie nic nie zapisujemy do bazy (patrz komentarz na
      // CreateEventScreenProps) — użytkownik ma zobaczyć cały flow bez
      // tworzenia realnego eventu widocznego dla innych.
      onDemoSubmit?.();
      return;
    }

    let durationMin = 120;
    if (endTime.trim()) {
      const endsAt = parseLocalDateTime(date, endTime);
      if (endsAt) {
        const diff = (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000;
        durationMin = Math.min(600, Math.round(diff));
      }
    }

    const limit = maxPlayers.trim() ? Number(maxPlayers) : null;
    const priceCents = isPaid ? Math.round(Number(price.replace(',', '.')) * 100) : null;

    setSubmitting(true);

    const uploadedUrls: string[] = [];
    for (const img of images) {
      const upload = await uploadEventImage(userId, img.uri, img.mimeType, img.base64);
      if (upload.error) {
        setSubmitting(false);
        notifyError(t('createEvent.errImage'));
        return;
      }
      if (upload.publicUrl) uploadedUrls.push(upload.publicUrl);
    }
    const imageUrl = uploadedUrls[0] ?? null;

    const [lng, lat] = location.center;
    const { data, error } = await createDiscoverEvent(userId, {
      title: title.trim(),
      category,
      subcategory,
      starts_at: startsAt,
      duration_min: durationMin,
      lat,
      lng,
      field_id: location.fieldId,
      location_name: location.name.trim() || null,
      notes: notes.trim() || null,
      description_long: descriptionLong.trim() || null,
      image_url: imageUrl,
      image_urls: uploadedUrls,
      organizer_name: organizerName.trim() || null,
      organizer_contact: organizerContact.trim() || null,
      organizer_url: organizerUrl.trim() || null,
      max_players: limit,
      payment_status: isPaid ? 'paid' : 'free',
      price_cents: priceCents,
      skill_level: skillLevel,
      is_instant: false,
    });

    setSubmitting(false);

    if (error || !data) {
      const msg = error?.message ?? '';
      if (msg.includes('DAILY_EVENT_LIMIT')) {
        notifyError(t('createEvent.errDailyLimitBody'));
        return;
      }
      if (msg.includes('EVENT_SUBCATEGORY_REQUIRED')) {
        setStepId('subcategory');
        setStepError(t('createEvent.errSubcategory'));
        return;
      }
      if (msg.includes('EVENT_CATEGORY_REQUIRED')) {
        setStepId('category');
        setStepError(t('createEvent.errCategory'));
        return;
      }
      if (msg.includes('EVENT_TITLE_REQUIRED')) {
        setStepId('details');
        setStepError(t('createEvent.errTitle'));
        return;
      }
      if (msg.includes('EVENT_LOCATION_REQUIRED')) {
        setStepId('location');
        setStepError(t('createEvent.errLocation'));
        return;
      }
      if (msg.includes('EVENT_LOCATION_OUTSIDE_TRICITY')) {
        setStepId('location');
        setStepError(t('createEvent.errLocationOutsideTricity'));
        return;
      }
      notifyError(msg || t('createEvent.errGeneric'));
      return;
    }

    router.replace({ pathname: '/event/[id]', params: { id: data.id } });
  }

  const stepHeader = STEP_HEADERS[stepId];
  const isLastStep = stepId === 'summary';
  const showFooterNext = stepId === 'location' || stepId === 'details';

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.topbar}>
          <Pressable onPress={goBack} hitSlop={10}>
            <Text style={styles.back}>‹ {t('createEvent.back')}</Text>
          </Pressable>
          <Text style={styles.stepCounter}>
            {t('createEvent.stepOf')
              .replace('{current}', String(stepIndex + 1))
              .replace('{total}', String(totalSteps))}
          </Text>
          <View style={{ width: 64 }} />
        </View>
        <View style={styles.progressTrack}>
          {steps.map((id, i) => (
            <View
              key={id}
              style={[styles.progressSeg, i <= stepIndex && styles.progressSegActive]}
            />
          ))}
        </View>
        <Text style={styles.screenTitle}>{t(stepHeader.title)}</Text>
        <Text style={styles.screenSubtitle}>{t(stepHeader.subtitle)}</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {stepId === 'subcategory' ? (
          <View style={styles.cardGrid}>
            {subcats.map((sub) => {
              const active = subcategory === sub.id;
              return (
                <Pressable
                  key={sub.id}
                  style={[styles.subCard, active && styles.subCardActive]}
                  onPress={() => selectSubcategory(sub.id)}>
                  <Text style={styles.subEmoji}>{markerEmoji(category ?? 'inne', sub.id)}</Text>
                  <Text style={[styles.subLabel, active && styles.subLabelActive]}>
                    {subcategoryLabel(sub.id) ?? sub.id}
                  </Text>
                  {active ? (
                    <View style={styles.subCardCheck}>
                      <Text style={styles.subCardCheckText}>✓</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {stepId === 'location' ? (
          <View>
            <View style={styles.locCtxRow}>
              <View style={styles.locCtxChip}>
                <Text style={styles.locCtxEmoji}>
                  {category ? CATEGORY_META[category].emoji : '📍'}
                </Text>
                <Text style={styles.locCtxLabel} numberOfLines={1}>
                  {category ? categoryLabel(category) : t('createEvent.step3Title')}
                  {subcategory ? ` · ${subcategoryLabel(subcategory)}` : ''}
                </Text>
              </View>
              {categoryFields.length > 0 ? (
                <View style={styles.locCtxCount}>
                  <Text style={styles.locCtxCountText}>
                    {categoryFields.length} {t('createEvent.placesNearby')}
                  </Text>
                </View>
              ) : null}
            </View>

            {fieldSportLocked && lockedSubcategory ? (
              <Text style={styles.fieldSportLockedHint}>
                {t('createEvent.fieldSportLockedHint')} ({subcategoryLabel(lockedSubcategory)})
              </Text>
            ) : null}

            <View style={styles.searchWrap}>
              <View style={styles.searchInputRow}>
                <Text style={styles.searchInputIcon}>🔎</Text>
                <TextInput
                  style={styles.searchInput}
                  value={searchQuery}
                  onChangeText={runSearch}
                  placeholder={t('createEvent.searchCity')}
                  placeholderTextColor={Brand.textMuted}
                  returnKeyType="search"
                />
                {searchQuery.length > 0 ? (
                  <Pressable
                    onPress={() => {
                      setSearchQuery('');
                      setSearchResults(null);
                    }}
                    hitSlop={10}
                    style={styles.searchClear}>
                    <Text style={styles.searchClearText}>✕</Text>
                  </Pressable>
                ) : null}
              </View>
              {searchQuery.trim().length >= 2 && (searchResults?.length ?? 0) > 0 ? (
                <View style={styles.searchResults}>
                  {searchResults!.slice(0, 6).map((r) => (
                    <Pressable
                      key={r.id}
                      style={styles.searchResult}
                      onPress={() => selectCity(r)}>
                      <Text style={styles.searchResultLabel} numberOfLines={1}>
                        🔎 {r.label}
                      </Text>
                      {r.subtitle ? (
                        <Text style={styles.searchResultSub} numberOfLines={1}>
                          {r.subtitle}
                        </Text>
                      ) : null}
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>

            <Text style={styles.mapPickHint}>{t('createEvent.mapPickHint')}</Text>

            {token ? (
              <>
                <View style={styles.mapLarge}>
                  <MapView
                    style={styles.map}
                    styleURL={Mapbox.StyleURL.Street}
                    logoEnabled={false}
                    attributionEnabled={false}
                    scaleBarEnabled={false}
                    compassEnabled={false}
                    zoomEnabled={false}
                    scrollEnabled={false}
                    pitchEnabled={false}
                    rotateEnabled={false}
                    onCameraChanged={onCameraChanged}
                    onMapIdle={onMapIdle}
                    onPress={onMapPress}>
                    <Camera
                      ref={cameraRef}
                      defaultSettings={{
                        centerCoordinate: location?.center ?? coords ?? POLAND_CENTER,
                        zoomLevel: location ? 14 : coords ? 11 : 6,
                      }}
                    />
                    <Images images={mapBubbleIcons} />
                    <ShapeSource
                      id="create-fields"
                      shape={fieldFeatures}
                      onPress={onFieldPress}
                      cluster
                      clusterRadius={55}
                      clusterMaxZoomLevel={13}
                      clusterProperties={FIELD_PICKER_CLUSTER_PROPERTIES}>
                      <FieldLayers prefix="inline" />
                    </ShapeSource>
                    <LockedRegionsOverlay
                      id="create-locked-regions-inline"
                      shape={lockedRegions}
                      onPress={onLockedRegionPress}
                    />
                    {location ? (
                      <MarkerView coordinate={location.center} anchor={{ x: 0.5, y: 1 }} allowOverlap>
                        <Text style={styles.selectedPin}>📍</Text>
                      </MarkerView>
                    ) : null}
                  </MapView>
                  {loadingPlaces ? (
                    <View style={styles.mapLoading} pointerEvents="none">
                      <ActivityIndicator color={Brand.primary} />
                    </View>
                  ) : null}
                  <Image
                    source={require('../../assets/images/dudieday-logo.png')}
                    style={[styles.brandWatermark, { right: undefined, left: 12 }]}
                    resizeMode="cover"
                  />
                  <Pressable style={styles.expandBtn} onPress={() => setMapFull(true)} hitSlop={8}>
                    <Text style={styles.expandBtnText}>⤢ {t('createEvent.enlargeMap')}</Text>
                  </Pressable>
                </View>

                {location ? (
                  <View style={styles.selectedCard}>
                    <Text style={styles.selectedLabel}>{t('createEvent.selectedPlace')}</Text>
                    <Text style={styles.selectedName} numberOfLines={2}>
                      📍 {location.name || t('createEvent.noLocation')}
                    </Text>
                    <TextInput
                      style={[styles.input, { marginTop: 8 }]}
                      value={location.name}
                      onChangeText={(v) =>
                        setLocation((prev) => (prev ? { ...prev, name: v } : prev))
                      }
                      placeholder={t('createEvent.locationNamePlaceholder')}
                      placeholderTextColor={Brand.textMuted}
                    />
                  </View>
                ) : (
                  <Text style={styles.emptyHint}>
                    {categoryFields.length > 0
                      ? t('createEvent.tapMarkerHint')
                      : t('createEvent.noSuggestions')}
                  </Text>
                )}

                <Pressable
                  style={styles.customPointBtn}
                  onPress={() => {
                    setCustomPointMode(true);
                    setMapFull(true);
                  }}>
                  <Text style={styles.customPointEmoji}>✛</Text>
                  <View style={styles.flex1}>
                    <Text style={styles.customPointText}>{t('createEvent.customPoint')}</Text>
                    <Text style={styles.customPointHint}>{t('createEvent.customPointHint')}</Text>
                  </View>
                  <Text style={styles.customPointChevron}>›</Text>
                </Pressable>
              </>
            ) : (
              <View style={styles.mapDisabled}>
                <Text style={styles.mapDisabledText}>{t('map.missingToken')}</Text>
              </View>
            )}
          </View>
        ) : null}

        {stepId === 'details' ? (
          <View>
            <Field label={t('createEvent.titleLabel')} required>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder={t('createEvent.titlePlaceholder')}
                placeholderTextColor={Brand.textMuted}
                maxLength={80}
              />
            </Field>

            <View style={styles.row}>
              <Field label={t('createEvent.date')} required style={styles.flex1}>
                <DatePickerField label={t('createEvent.date')} required value={date} onChange={setDate} />
              </Field>
            </View>
            <View style={styles.row}>
              <Field label={t('createEvent.start')} required style={styles.flex1}>
                <TimePickerField label={t('createEvent.start')} required value={startTime} onChange={setStartTime} />
              </Field>
              <Field label={t('createEvent.end')} style={styles.flex1}>
                <TimePickerField label={t('createEvent.end')} value={endTime} onChange={setEndTime} />
              </Field>
            </View>

            <Field label={t('createEvent.maxPlayers')}>
              <TextInput
                style={styles.input}
                value={maxPlayers}
                onChangeText={setMaxPlayers}
                placeholder={t('createEvent.maxPlayersPlaceholder')}
                placeholderTextColor={Brand.textMuted}
                keyboardType="number-pad"
              />
            </Field>

            <Text style={styles.photosLabel}>{t('createEvent.photos')}</Text>
            {images.length === 0 ? (
              <Pressable style={styles.imagePicker} onPress={handleAddImages}>
                <View style={styles.imagePlaceholder}>
                  <Text style={styles.imagePlaceholderEmoji}>🖼️</Text>
                  <Text style={styles.imagePlaceholderText}>{t('createEvent.addPhotos')}</Text>
                </View>
              </Pressable>
            ) : (
              <>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.gallery}>
                  {images.map((img, index) => (
                    <View key={`${img.uri}-${index}`} style={styles.thumbWrap}>
                      <Image source={{ uri: img.uri }} style={styles.thumb} resizeMode="cover" />
                      {index === 0 ? (
                        <View style={styles.coverBadge}>
                          <Text style={styles.coverBadgeText}>{t('createEvent.cover')}</Text>
                        </View>
                      ) : null}
                      <Pressable
                        style={styles.thumbRemove}
                        onPress={() => removeImage(index)}
                        hitSlop={6}>
                        <Text style={styles.thumbRemoveText}>×</Text>
                      </Pressable>
                    </View>
                  ))}
                  {images.length < 8 ? (
                    <Pressable style={styles.thumbAdd} onPress={handleAddImages}>
                      <Text style={styles.thumbAddPlus}>＋</Text>
                      <Text style={styles.thumbAddText}>{t('createEvent.add')}</Text>
                    </Pressable>
                  ) : null}
                </ScrollView>
                <Text style={styles.hint}>{t('createEvent.photosHint')}</Text>
              </>
            )}

            <Pressable
              onPress={() => setMoreOpen((value) => !value)}
              style={({ pressed }) => [styles.moreToggle, pressed && styles.submitDisabled]}>
              <Text style={styles.moreToggleText}>
                {moreOpen ? t('createEvent.less') : t('createEvent.more')}
              </Text>
              <Text style={styles.moreChevron}>{moreOpen ? '▲' : '▼'}</Text>
            </Pressable>

            {moreOpen ? (
              <View>
                <Field label={t('createEvent.shortDesc')}>
                  <TextInput
                    style={[styles.input, styles.multiline]}
                    value={notes}
                    onChangeText={setNotes}
                    placeholder={t('createEvent.shortDescPlaceholder')}
                    placeholderTextColor={Brand.textMuted}
                    multiline
                    maxLength={400}
                  />
                </Field>

                <Field label={t('createEvent.fullDesc')}>
                  <TextInput
                    style={[styles.input, styles.multilineLarge]}
                    value={descriptionLong}
                    onChangeText={setDescriptionLong}
                    placeholder={t('createEvent.fullDescPlaceholder')}
                    placeholderTextColor={Brand.textMuted}
                    multiline
                  />
                </Field>

                <Field label={t('createEvent.skillLevel')}>
                  <View style={styles.skillChips}>
                    {SKILL_OPTIONS.map((opt) => {
                      const active = skillLevel === opt.id;
                      return (
                        <Pressable
                          key={opt.id}
                          style={[styles.skillChip, active && styles.skillChipActive]}
                          onPress={() => setSkillLevel(opt.id)}>
                          <Text
                            style={[styles.skillChipText, active && styles.skillChipTextActive]}>
                            {t(opt.labelKey)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </Field>

                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>{t('createEvent.paid')}</Text>
                  <Switch
                    value={isPaid}
                    onValueChange={setIsPaid}
                    trackColor={{ true: Brand.primaryMuted, false: Brand.border }}
                    thumbColor={isPaid ? Brand.primary : '#f4f3f4'}
                  />
                </View>
                {isPaid ? (
                  <Field label={t('createEvent.price')}>
                    <TextInput
                      style={styles.input}
                      value={price}
                      onChangeText={setPrice}
                      placeholder={t('createEvent.pricePlaceholder')}
                      placeholderTextColor={Brand.textMuted}
                      keyboardType="decimal-pad"
                    />
                  </Field>
                ) : null}

                <Text style={styles.sectionHeader}>{t('createEvent.organizer')}</Text>
                <Field label={t('createEvent.organizerName')}>
                  <TextInput
                    style={styles.input}
                    value={organizerName}
                    onChangeText={setOrganizerName}
                    placeholder={t('createEvent.organizerNamePlaceholder')}
                    placeholderTextColor={Brand.textMuted}
                  />
                </Field>
                <Field label={t('createEvent.organizerContact')}>
                  <TextInput
                    style={styles.input}
                    value={organizerContact}
                    onChangeText={setOrganizerContact}
                    placeholder={t('createEvent.organizerContactPlaceholder')}
                    placeholderTextColor={Brand.textMuted}
                  />
                </Field>
                <Field label={t('createEvent.organizerUrl')}>
                  <TextInput
                    style={styles.input}
                    value={organizerUrl}
                    onChangeText={setOrganizerUrl}
                    placeholder="https://…"
                    placeholderTextColor={Brand.textMuted}
                    autoCapitalize="none"
                  />
                </Field>
              </View>
            ) : null}
          </View>
        ) : null}

        {stepId === 'summary' ? (
          <View style={styles.summary}>
            {images[0] ? (
              <Image source={{ uri: images[0].uri }} style={styles.summaryCover} resizeMode="cover" />
            ) : null}
            <Text style={styles.summaryTitle}>{title.trim() || t('createEvent.titleLabel')}</Text>

            <SummaryRow label={t('createEvent.summaryWhat')}>
              <Text style={styles.summaryValue}>
                {category ? `${CATEGORY_META[category].emoji} ${categoryLabel(category)}` : '—'}
                {subcategory ? ` · ${subcategoryLabel(subcategory)}` : ''}
              </Text>
            </SummaryRow>
            <SummaryRow label={t('createEvent.summaryWhere')}>
              <Text style={styles.summaryValue}>{location?.name || t('createEvent.noLocation')}</Text>
            </SummaryRow>
            <SummaryRow label={t('createEvent.summaryWhen')}>
              <Text style={styles.summaryValue}>
                {date} · {startTime}
                {endTime.trim() ? `–${endTime.trim()}` : ''}
              </Text>
            </SummaryRow>
            <SummaryRow label={t('createEvent.summaryWho')}>
              <Text style={styles.summaryValue}>
                {maxPlayers.trim() ? maxPlayers.trim() : t('createEvent.noLimit')}
              </Text>
            </SummaryRow>
            <SummaryRow label={t('createEvent.summaryPrice')}>
              <Text style={styles.summaryValue}>
                {isPaid && price.trim() ? `${price.trim()} zł` : t('createEvent.free')}
              </Text>
            </SummaryRow>

            {notes.trim() ? <Text style={styles.summaryNotes}>{notes.trim()}</Text> : null}
          </View>
        ) : null}

        {stepError ? <Text style={styles.errorText}>{stepError}</Text> : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable style={styles.footerBack} onPress={goBack}>
          <Text style={styles.footerBackText}>{t('createEvent.back')}</Text>
        </Pressable>
        {isLastStep ? (
          <Pressable
            style={[styles.footerNext, submitting && styles.submitDisabled]}
            onPress={handleSubmit}
            disabled={submitting}>
            {submitting ? (
              <ActivityIndicator color={Brand.primaryText} />
            ) : (
              <Text style={styles.footerNextText}>
                {demoMode ? t('createEvent.publishDemo') : t('createEvent.publish')}
              </Text>
            )}
          </Pressable>
        ) : showFooterNext ? (
          <Pressable style={styles.footerNext} onPress={goNext}>
            <Text style={styles.footerNextText}>{t('createEvent.next')}</Text>
          </Pressable>
        ) : (
          <View style={styles.flex1} />
        )}
      </View>

      <Modal
        visible={mapFull && Boolean(token)}
        animationType="slide"
        onRequestClose={() => {
          setCustomPointMode(false);
          setMapFull(false);
        }}>
        <View style={styles.fullRoot}>
          <View style={styles.fullMapWrap}>
            <MapView
              style={styles.map}
              styleURL={Mapbox.StyleURL.Street}
              logoEnabled={false}
              attributionEnabled={false}
              scaleBarEnabled={false}
              compassEnabled={false}
              zoomEnabled
              scrollEnabled
              pitchEnabled={false}
              rotateEnabled={false}
              onCameraChanged={onCameraChanged}
              onMapIdle={onMapIdle}
              onPress={onMapPress}>
              <Camera
                ref={fullCameraRef}
                defaultSettings={{
                  centerCoordinate: location?.center ?? centerRef.current,
                  zoomLevel: location ? 15 : coords ? 11 : 6,
                }}
              />
              <Images images={mapBubbleIcons} />
              <ShapeSource
                id="create-fields-full"
                shape={fieldFeatures}
                onPress={onFieldPress}
                cluster
                clusterRadius={55}
                clusterMaxZoomLevel={13}
                clusterProperties={FIELD_PICKER_CLUSTER_PROPERTIES}>
                <FieldLayers prefix="full" />
              </ShapeSource>
              <LockedRegionsOverlay
                id="create-locked-regions-full"
                shape={lockedRegions}
                onPress={onLockedRegionPress}
              />
              {location ? (
                <MarkerView coordinate={location.center} anchor={{ x: 0.5, y: 1 }} allowOverlap>
                  <Text style={styles.selectedPin}>📍</Text>
                </MarkerView>
              ) : null}
            </MapView>

            <Image
              source={require('../../assets/images/dudieday-logo.png')}
              style={[styles.brandWatermark, { bottom: insets.bottom + 96 }]}
              resizeMode="cover"
            />

            <View style={[styles.fullSearchWrap, { top: insets.top + 12 }]}>
              <TextInput
                style={styles.fullSearchInput}
                value={searchQuery}
                onChangeText={runSearch}
                placeholder={t('createEvent.searchCity')}
                placeholderTextColor={Brand.textMuted}
              />
              {(searchResults?.length ?? 0) > 0 && searchQuery.trim().length >= 2 ? (
                <View style={styles.searchResults}>
                  {searchResults!.slice(0, 6).map((r) => (
                    <Pressable key={r.id} style={styles.searchResult} onPress={() => selectCity(r)}>
                      <Text style={styles.searchResultLabel}>🔎 {r.label}</Text>
                      {r.subtitle ? <Text style={styles.searchResultSub}>{r.subtitle}</Text> : null}
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>

            <Pressable
              style={[styles.fullClose, { top: insets.top + 12 }]}
              onPress={() => {
                setCustomPointMode(false);
                setMapFull(false);
              }}
              hitSlop={10}>
              <Text style={styles.fullCloseText}>✕</Text>
            </Pressable>
          </View>

          <View style={[styles.fullActions, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.fullHint}>
              {customPointMode
                ? t('createEvent.customPointActive')
                : location
                  ? `📍 ${location.name || t('createEvent.noLocation')}`
                  : t('createEvent.mapHintFull')}
            </Text>
            <View style={styles.fullActionsRow}>
              <Pressable
                style={[styles.fullToggle, customPointMode && styles.fullToggleActive]}
                onPress={() => setCustomPointMode((v) => !v)}>
                <Text
                  style={[
                    styles.fullToggleText,
                    customPointMode && styles.fullToggleTextActive,
                  ]}>
                  ✛ {customPointMode ? t('createEvent.customPointOn') : t('createEvent.customPoint')}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.fullConfirm, !location && styles.submitDisabled]}
                onPress={() => {
                  setCustomPointMode(false);
                  setMapFull(false);
                }}
                disabled={!location}>
                <Text style={styles.fullConfirmText}>{t('createEvent.done')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const STEP_HEADERS: Record<StepId, { title: TKeyish; subtitle: TKeyish }> = {
  category: { title: 'createEvent.step1Title', subtitle: 'createEvent.step1Subtitle' },
  subcategory: { title: 'createEvent.step2Title', subtitle: 'createEvent.step2Subtitle' },
  location: { title: 'createEvent.step3Title', subtitle: 'createEvent.step3Subtitle' },
  details: { title: 'createEvent.step4Title', subtitle: 'createEvent.step4Subtitle' },
  summary: { title: 'createEvent.step6Title', subtitle: 'createEvent.step6Subtitle' },
};

type TKeyish = Parameters<typeof t>[0];

// Poziomy zaawansowania zgodne z filtrami wydarzeń (mapa): any/beginner/intermediate/advanced.
const SKILL_OPTIONS: { id: SkillLevel; labelKey: TKeyish }[] = [
  { id: 'any', labelKey: 'createEvent.skillAny' },
  { id: 'beginner', labelKey: 'createEvent.skillBeginner' },
  { id: 'intermediate', labelKey: 'createEvent.skillIntermediate' },
  { id: 'advanced', labelKey: 'createEvent.skillAdvanced' },
];

/**
 * Te same bąble co na głównej mapie (ciemnoniebieskie kółko + biały glif
 * sportu z mapBubbleIcons, ta sama siatka ikon w klastrze) — bez pierścienia
 * dostępności/licznika eventów przy ikonie, bo w kreatorze nie mamy (i nie
 * potrzebujemy) danych o żywych eventach na boisku, tylko listę miejsc do
 * wyboru. `total_events` tutaj to zwykła liczba zgrupowanych boisk (per
 * punkt +1), nie suma eventów — potrzebna wyłącznie po to, żeby dało się
 * użyć TYCH SAMYCH builderów siatki ikon klastra z map-theme.ts (rosną wraz
 * z tą wartością), zamiast duplikować ich logikę.
 */
const FIELD_PICKER_CLUSTER_PROPERTIES = {
  total_events: ['+', 1],
  ...buildClusterCategoryProperties(),
};

/**
 * Szara blokada poza Trójmiastem — ten sam wygląd (fill + przerywany obrys +
 * kłódki wzdłuż granicy) co locked-regions na głównej mapie, patrz
 * map-view.tsx. `id` musi być unikalny per instancja ShapeSource (mapa
 * inline i pełnoekranowa renderują tę nakładkę osobno).
 */
function LockedRegionsOverlay({
  id,
  shape,
  onPress,
}: {
  id: string;
  shape: GeoJSON.FeatureCollection;
  onPress?: () => void;
}) {
  return (
    <ShapeSource id={id} shape={shape} onPress={onPress}>
      <FillLayer
        id={`${id}-fill`}
        style={{
          fillColor: '#94a3b8',
          fillOpacity: 0.6,
        }}
      />
      <LineLayer
        id={`${id}-outline`}
        style={{
          lineColor: '#475569',
          lineWidth: 1.5,
          lineDasharray: [2, 2],
        }}
      />
      <SymbolLayer
        id={`${id}-lock`}
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
  );
}

/**
 * `sourceID` jest wstrzykiwany przez ShapeSource (cloneReactChildrenWithProps) i MUSI
 * być przekazany dalej do każdej warstwy, inaczej nic się nie renderuje.
 */
function FieldLayers({ prefix, sourceID }: { prefix: string; sourceID?: string }) {
  return (
    <>
      <CircleLayer
        id={`${prefix}-clusters`}
        sourceID={sourceID}
        filter={['has', 'point_count']}
        style={{
          circleRadius: ['interpolate', ['linear'], ['get', 'total_events'], 1, 24, 5, 28, 15, 32, 40, 38],
          circleColor: BUBBLE_CENTER_COLOR,
          circleStrokeWidth: 4,
          circleStrokeColor: '#ffffff',
        }}
      />
      <SymbolLayer
        id={`${prefix}-cluster-count`}
        sourceID={sourceID}
        filter={['has', 'point_count']}
        style={{
          textField: ['get', 'total_events'],
          textSize: 15,
          textColor: '#ffffff',
          textOffset: [0, -0.95],
          textAllowOverlap: true,
          textIgnorePlacement: true,
        }}
      />
      {/* Siatka ikon kategorii w klastrze — dokładnie ten sam builder co na
          głównej mapie/mapie eventów (map-theme.ts), więc te same ikony
          niezależnie od tego, gdzie w apce jest ta mapa. */}
      {([0, 1, 2, 3] as const).map((slot) => (
        <SymbolLayer
          key={`${prefix}-cluster-icon-slot-${slot}`}
          id={`${prefix}-cluster-icon-slot-${slot}`}
          sourceID={sourceID}
          filter={['all', ['has', 'point_count'], buildClusterIconSlotVisibleFilter(slot)]}
          style={{
            iconImage: buildClusterIconSlotExpression(slot),
            iconSize: buildClusterIconSizeExpression(),
            iconOffset: buildClusterIconSlotOffsetExpression(slot),
            iconAllowOverlap: true,
            iconIgnorePlacement: true,
          }}
        />
      ))}
      <CircleLayer
        id={`${prefix}-ring`}
        sourceID={sourceID}
        filter={['!', ['has', 'point_count']]}
        style={{
          circleRadius: 22,
          circleColor: BUBBLE_CENTER_COLOR,
          circleStrokeWidth: 4,
          circleStrokeColor: '#ffffff',
        }}
      />
      <SymbolLayer
        id={`${prefix}-icon`}
        sourceID={sourceID}
        filter={['!', ['has', 'point_count']]}
        style={{
          iconImage: ['get', 'bubbleIcon'],
          iconSize: 1.1,
          iconAllowOverlap: true,
          iconIgnorePlacement: true,
        }}
      />
    </>
  );
}

function Field({
  label,
  children,
  style,
  required,
}: {
  label: string;
  children: React.ReactNode;
  style?: object;
  required?: boolean;
}) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={styles.requiredMark}> *</Text> : null}
      </Text>
      {children}
    </View>
  );
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryRowLabel}>{label}</Text>
      <View style={styles.flex1}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Brand.screenBackground,
  },
  header: {
    paddingHorizontal: Layout.screenPaddingX,
    paddingBottom: 14,
    backgroundColor: Brand.surface,
    borderBottomWidth: 1,
    borderBottomColor: Brand.border,
  },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  back: {
    fontFamily: BrandFonts.bodySemibold,
    fontSize: 16,
    color: Brand.primary,
    width: 64,
  },
  stepCounter: {
    fontFamily: BrandFonts.monoSemibold,
    fontVariant: ['tabular-nums'],
    fontSize: 13,
    color: Brand.textMuted,
  },
  progressTrack: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
  },
  progressSeg: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: Brand.border,
  },
  progressSegActive: {
    backgroundColor: Brand.primary,
  },
  screenTitle: {
    fontFamily: BrandFonts.display,
    fontSize: 26,
    color: Brand.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.2,
    marginTop: 4,
  },
  screenSubtitle: {
    fontFamily: BrandFonts.body,
    fontSize: 14,
    color: Brand.textMuted,
    marginTop: 2,
  },
  content: {
    paddingHorizontal: Layout.screenPaddingX,
    paddingTop: 16,
    gap: 4,
  },
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  catCard: {
    width: '47%',
    flexGrow: 1,
    paddingVertical: 22,
    paddingHorizontal: 14,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
    alignItems: 'center',
    gap: 8,
    ...shadow('sm'),
  },
  catEmoji: {
    fontFamily: BrandFonts.body,
    fontSize: 34,
  },
  catLabel: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 15,
    color: Brand.textPrimary,
  },
  subCard: {
    position: 'relative',
    width: '47%',
    flexGrow: 1,
    paddingVertical: 18,
    paddingHorizontal: 14,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
    alignItems: 'center',
    gap: 6,
    ...shadow('sm'),
  },
  subCardActive: {
    borderColor: Brand.ink,
    backgroundColor: Brand.ink,
    ...shadow('md'),
  },
  subCardCheck: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 20,
    height: 20,
    borderRadius: 999,
    backgroundColor: Brand.pitch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subCardCheckText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#ffffff',
  },
  subEmoji: {
    fontFamily: BrandFonts.body,
    fontSize: 26,
  },
  subLabel: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 14,
    fontWeight: '700',
    color: Brand.textPrimary,
    textAlign: 'center',
  },
  subLabelActive: {
    color: '#ffffff',
  },
  field: {
    marginTop: 14,
  },
  fieldLabel: {
    ...Typography.label,
    marginBottom: 6,
  },
  requiredMark: {
    color: Brand.danger,
    fontWeight: '800',
  },
  input: {
    fontFamily: BrandFonts.body,
    backgroundColor: Brand.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Brand.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Brand.textPrimary,
  },
  multiline: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  multilineLarge: {
    minHeight: 130,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  flex1: {
    flex: 1,
  },
  hint: {
    fontFamily: BrandFonts.body,
    fontSize: 12,
    color: Brand.textMuted,
    marginTop: 6,
  },
  emptyHint: {
    fontFamily: BrandFonts.body,
    fontSize: 13,
    color: Brand.textMuted,
    marginTop: 12,
    lineHeight: 19,
  },
  searchWrap: {
    position: 'relative',
    zIndex: 10,
  },
  locCtxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  locCtxChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    backgroundColor: Brand.primaryMuted,
    borderWidth: 1,
    borderColor: Brand.primary,
  },
  locCtxEmoji: {
    fontFamily: BrandFonts.body,
    fontSize: 16,
  },
  locCtxLabel: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 13,
    fontWeight: '800',
    color: Brand.primary,
    flexShrink: 1,
  },
  locCtxCount: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Brand.surfaceMuted,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  locCtxCountText: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 12,
    fontWeight: '700',
    color: Brand.textSecondary,
  },
  searchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Brand.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Brand.border,
    paddingHorizontal: 12,
  },
  searchInputIcon: {
    fontFamily: BrandFonts.body,
    fontSize: 15,
    marginRight: 8,
  },
  searchInput: {
    fontFamily: BrandFonts.body,
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: Brand.textPrimary,
  },
  searchClear: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Brand.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchClearText: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 12,
    fontWeight: '800',
    color: Brand.textMuted,
  },
  listHeader: {
    ...Typography.label,
    marginTop: 18,
  },
  suggestList: {
    marginTop: 10,
    backgroundColor: Brand.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Brand.border,
    overflow: 'hidden',
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Brand.border,
  },
  suggestIcon: {
    fontFamily: BrandFonts.body,
    fontSize: 20,
  },
  suggestLabel: {
    fontFamily: BrandFonts.bodySemibold,
    fontSize: 14,
    fontWeight: '600',
    color: Brand.textPrimary,
  },
  suggestSub: {
    fontFamily: BrandFonts.body,
    fontSize: 12,
    color: Brand.textMuted,
    marginTop: 2,
  },
  suggestDist: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 12,
    fontWeight: '700',
    color: Brand.primary,
  },
  selectedCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Brand.primary,
    backgroundColor: Brand.primaryMuted,
  },
  selectedLabel: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: Brand.primary,
  },
  selectedName: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 15,
    fontWeight: '700',
    color: Brand.textPrimary,
    marginTop: 4,
  },
  searchResults: {
    marginTop: 6,
    backgroundColor: Brand.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Brand.border,
    overflow: 'hidden',
    ...shadow('md'),
  },
  searchResult: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Brand.border,
  },
  searchResultLabel: {
    fontFamily: BrandFonts.bodySemibold,
    fontSize: 14,
    fontWeight: '600',
    color: Brand.textPrimary,
  },
  searchResultSub: {
    fontFamily: BrandFonts.body,
    fontSize: 12,
    color: Brand.textMuted,
    marginTop: 2,
  },
  mapDisabled: {
    marginTop: 16,
    padding: 20,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surfaceMuted,
    alignItems: 'center',
  },
  mapDisabledText: {
    fontFamily: BrandFonts.body, color: Brand.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  mapWrap: {
    marginTop: 16,
    height: 220,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Brand.border,
  },
  map: {
    flex: 1,
  },
  mapPickHint: {
    fontFamily: BrandFonts.body,
    fontSize: 13,
    color: Brand.textMuted,
    marginTop: 14,
    marginBottom: 8,
    lineHeight: 19,
  },
  fieldSportLockedHint: {
    fontFamily: BrandFonts.bodySemibold,
    fontSize: 13,
    color: Brand.primary,
    marginTop: 10,
    marginBottom: 4,
    fontWeight: '600',
    lineHeight: 19,
  },
  mapLarge: {
    height: 360,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Brand.border,
  },
  mapLoading: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: Brand.surface,
    borderRadius: Radius.pill,
    padding: 8,
    ...shadow('sm'),
  },
  brandWatermark: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    width: 36,
    height: 36,
    borderRadius: 9,
    opacity: 0.5,
    pointerEvents: 'none',
  },
  markerPin: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Brand.surface,
    borderWidth: 2,
    borderColor: Brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow('sm'),
  },
  markerPinSelected: {
    backgroundColor: Brand.primary,
    borderColor: Brand.primaryText,
    transform: [{ scale: 1.15 }],
  },
  markerEmoji: {
    fontFamily: BrandFonts.body,
    fontSize: 16,
  },
  customPointBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    padding: 14,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Brand.primary,
    backgroundColor: Brand.surface,
  },
  customPointEmoji: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 22,
    color: Brand.primary,
    fontWeight: '800',
  },
  customPointText: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 15,
    fontWeight: '800',
    color: Brand.textPrimary,
  },
  customPointHint: {
    fontFamily: BrandFonts.body,
    fontSize: 12,
    color: Brand.textMuted,
    marginTop: 2,
  },
  customPointChevron: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 24,
    color: Brand.textMuted,
    fontWeight: '700',
  },
  photosLabel: {
    ...Typography.label,
    marginTop: 14,
    marginBottom: 6,
  },
  skillChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  skillChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
  },
  skillChipActive: {
    backgroundColor: Brand.primary,
    borderColor: Brand.primary,
  },
  skillChipText: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 13,
    fontWeight: '700',
    color: Brand.textSecondary,
  },
  skillChipTextActive: {
    color: Brand.primaryText,
  },
  moreToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surfaceMuted,
  },
  moreToggleText: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 15,
    fontWeight: '700',
    color: Brand.textSecondary,
  },
  moreChevron: {
    fontFamily: BrandFonts.body,
    fontSize: 13,
    color: Brand.textMuted,
  },
  crosshair: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crosshairPin: {
    fontFamily: BrandFonts.body,
    fontSize: 34,
    marginBottom: 24,
  },
  selectedPin: {
    fontFamily: BrandFonts.body,
    fontSize: 34,
  },
  fullClose: {
    position: 'absolute',
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Brand.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow('md'),
  },
  fullCloseText: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 18,
    fontWeight: '800',
    color: Brand.textPrimary,
  },
  expandBtn: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: Radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  expandBtnText: {
    fontFamily: BrandFonts.bodyBold,
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  setHereBtn: {
    marginTop: 10,
    backgroundColor: Brand.surface,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    borderColor: Brand.primary,
    paddingVertical: 12,
    alignItems: 'center',
  },
  setHereText: {
    fontFamily: BrandFonts.bodyBold,
    color: Brand.primary,
    fontSize: 15,
    fontWeight: '800',
  },
  sectionHeader: {
    ...Typography.sectionTitle,
    marginTop: 24,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
    paddingVertical: 4,
  },
  switchLabel: {
    fontFamily: BrandFonts.bodySemibold,
    fontSize: 15,
    fontWeight: '600',
    color: Brand.textPrimary,
  },
  errorText: {
    fontFamily: BrandFonts.bodySemibold,
    fontSize: 14,
    fontWeight: '600',
    color: Brand.danger,
    marginTop: 14,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: Layout.screenPaddingX,
    paddingTop: 12,
    backgroundColor: Brand.surface,
    borderTopWidth: 1,
    borderTopColor: Brand.border,
  },
  footerBack: {
    paddingHorizontal: 22,
    paddingVertical: 15,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBackText: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 15,
    fontWeight: '700',
    color: Brand.textSecondary,
  },
  footerNext: {
    flex: 1,
    backgroundColor: Brand.primary,
    borderRadius: Radius.pill,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow('md'),
  },
  footerNextText: {
    fontFamily: BrandFonts.bodyBold,
    color: Brand.primaryText,
    fontSize: 16,
  },
  submitDisabled: {
    opacity: 0.7,
  },
  imagePicker: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Brand.surfaceMuted,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  imagePlaceholderEmoji: {
    fontFamily: BrandFonts.body,
    fontSize: 40,
  },
  imagePlaceholderText: {
    fontFamily: BrandFonts.bodySemibold,
    fontSize: 14,
    fontWeight: '600',
    color: Brand.textMuted,
  },
  gallery: {
    gap: 10,
    paddingVertical: 2,
  },
  thumbWrap: {
    width: 120,
    height: 90,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Brand.surfaceMuted,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  coverBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: Brand.primary,
    borderRadius: Radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  coverBadgeText: {
    fontFamily: BrandFonts.bodyBold,
    color: Brand.primaryText,
    fontSize: 10,
    fontWeight: '800',
  },
  thumbRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbRemoveText: {
    fontFamily: BrandFonts.bodyBold,
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 18,
  },
  thumbAdd: {
    width: 120,
    height: 90,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Brand.border,
    backgroundColor: Brand.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  thumbAddPlus: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 24,
    color: Brand.primary,
    fontWeight: '700',
  },
  thumbAddText: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 12,
    fontWeight: '700',
    color: Brand.textMuted,
  },
  summary: {
    gap: 4,
  },
  summaryCover: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: Radius.lg,
    marginBottom: 14,
  },
  summaryTitle: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 22,
    fontWeight: '800',
    color: Brand.textPrimary,
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1.5,
    borderStyle: 'dashed',
    borderBottomColor: Brand.border,
  },
  summaryRowLabel: {
    width: 96,
    fontFamily: BrandFonts.bodySemibold,
    fontSize: 13,
    color: Brand.textMuted,
  },
  summaryValue: {
    fontFamily: BrandFonts.bodySemibold,
    fontSize: 15,
    color: Brand.textPrimary,
  },
  summaryNotes: {
    fontFamily: BrandFonts.body,
    fontSize: 14,
    color: Brand.textSecondary,
    lineHeight: 21,
    marginTop: 14,
  },
  fullRoot: {
    flex: 1,
    backgroundColor: Brand.screenBackground,
  },
  fullMapWrap: {
    flex: 1,
  },
  fullSearchWrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 20,
    ...shadow('md'),
  },
  fullSearchInput: {
    fontFamily: BrandFonts.body,
    backgroundColor: Brand.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Brand.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Brand.textPrimary,
  },
  fullActions: {
    paddingHorizontal: Layout.screenPaddingX,
    paddingTop: 14,
    gap: 10,
    backgroundColor: Brand.surface,
    borderTopWidth: 1,
    borderTopColor: Brand.border,
  },
  fullHint: {
    fontFamily: BrandFonts.body,
    fontSize: 13,
    color: Brand.textMuted,
    textAlign: 'center',
  },
  fullActionsRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'stretch',
  },
  fullToggle: {
    flex: 1,
    borderRadius: Radius.pill,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Brand.primary,
    backgroundColor: Brand.surface,
  },
  fullToggleActive: {
    backgroundColor: Brand.primaryMuted,
  },
  fullToggleText: {
    fontFamily: BrandFonts.bodyBold,
    color: Brand.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  fullToggleTextActive: {
    color: Brand.primary,
  },
  fullConfirm: {
    flex: 1,
    backgroundColor: Brand.primary,
    borderRadius: Radius.pill,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow('md'),
  },
  fullConfirmText: {
    fontFamily: BrandFonts.bodyBold,
    color: Brand.primaryText,
    fontSize: 16,
    fontWeight: '800',
  },
});
