// maplibre-gl ma tylko eksporty nazwane (brak `export default`) — import przestrzeni nazw.
import * as maplibregl from 'maplibre-gl';
import type { LngLatLike, Map as MLMap, MapGeoJSONFeature } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Metro (bundler RN-owy) nie rozumie `new Worker(new URL(...), import.meta.url)`,
// którego maplibre-gl używa domyślnie do wczytania swojego workera (przetwarzanie
// kafelków/GeoJSON w tle) — bez tego źródła nigdy nie kończą ładowania (isSourceLoaded
// zostaje `false` na zawsze, nic się nie renderuje). Serwujemy gotowy plik workera
// (skopiowany z node_modules do /public przy starcie projektu) i wskazujemy go ręcznie.
if (typeof window !== 'undefined') {
  maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');
}
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { StyleSheet, View, type ViewStyle } from 'react-native';

/**
 * Minimalna, kompatybilna z API @rnmapbox/maps warstwa nad MapLibre GL JS
 * (darmowy, bez tokena, ten sam Style Spec i język wyrażeń co Mapbox GL).
 * Dzięki temu ekrany mapy (AppMap, EventsMap, FieldReportLocationPicker,
 * FieldNavigate) używają niemal identycznego JSX na wszystkich platformach —
 * tylko import się zmienia (`@rnmapbox/maps` -> ten plik) w wariantach `.web`.
 */

export type ImageEntry = { image: unknown; scale?: number };

export const StyleURL = {
  Street: 'https://tiles.openfreemap.org/styles/liberty',
};

const MapboxModule = { StyleURL, setAccessToken: (_token?: string | null) => {} };
const Mapbox = MapboxModule;
export default Mapbox;

export type MapState = {
  properties: {
    center: [number, number];
    zoom: number;
    bounds?: { ne: [number, number]; sw: [number, number] };
  };
  gestures: { isGestureActive: boolean };
};

function buildState(map: MLMap, isGestureActive: boolean): MapState {
  const center = map.getCenter();
  const bounds = map.getBounds();
  return {
    properties: {
      center: [center.lng, center.lat],
      zoom: map.getZoom(),
      bounds: {
        ne: [bounds.getEast(), bounds.getNorth()],
        sw: [bounds.getWest(), bounds.getSouth()],
      },
    },
    gestures: { isGestureActive },
  };
}

type PressEvent = { features?: GeoJSON.Feature[] };

type SourceRegistration = {
  sourceId: string;
  getLayerIds: () => string[];
  onPress?: (event: PressEvent) => void;
};

type MapCtx = {
  map: MLMap | null;
  loaded: boolean;
  registerSource: (reg: SourceRegistration) => () => void;
};

const MapContext = createContext<MapCtx>({ map: null, loaded: false, registerSource: () => () => {} });

function useMapContext(): MapCtx {
  return useContext(MapContext);
}

type MapViewProps = {
  style?: ViewStyle | ViewStyle[];
  styleURL?: string;
  logoEnabled?: boolean;
  attributionEnabled?: boolean;
  scaleBarEnabled?: boolean;
  compassEnabled?: boolean;
  scrollEnabled?: boolean;
  zoomEnabled?: boolean;
  rotateEnabled?: boolean;
  pitchEnabled?: boolean;
  /** Jak w natywnym RNMapbox: wywoływane z pojedynczym Feature (Point) w miejscu tapnięcia. */
  onPress?: (feature: GeoJSON.Feature) => void;
  onCameraChanged?: (state: MapState) => void;
  onMapIdle?: (state: MapState) => void;
  children?: ReactNode;
};

export const MapView = forwardRef<unknown, MapViewProps>(function MapView(
  {
    style,
    styleURL = StyleURL.Street,
    attributionEnabled = true,
    scrollEnabled = true,
    zoomEnabled = true,
    rotateEnabled = true,
    pitchEnabled = true,
    onPress,
    onCameraChanged,
    onMapIdle,
    children,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [loaded, setLoaded] = useState(false);
  const gestureActiveRef = useRef(false);
  const sourcesRef = useRef<Map<string, SourceRegistration>>(new Map());
  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;
  const onCameraChangedRef = useRef(onCameraChanged);
  onCameraChangedRef.current = onCameraChanged;
  const onMapIdleRef = useRef(onMapIdle);
  onMapIdleRef.current = onMapIdle;

  useImperativeHandle(ref, () => ({ getMap: () => mapRef.current }), []);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleURL,
      center: [19.1451, 51.9194],
      zoom: 6,
      attributionControl: attributionEnabled ? { compact: true } : false,
      scrollZoom: scrollEnabled,
      dragPan: scrollEnabled,
      boxZoom: zoomEnabled,
      doubleClickZoom: zoomEnabled,
      touchZoomRotate: zoomEnabled,
      dragRotate: rotateEnabled,
      pitchWithRotate: pitchEnabled,
      touchPitch: pitchEnabled,
    });
    mapRef.current = map;

    // 'load' czeka aż WSZYSTKIE kafelki startowego widoku się dociągną — w praktyce
    // (i w headless Chromium) potrafi nigdy się nie odpalić przy bogatym stylu
    // wektorowym. 'style.load' (styl gotowy, można dodawać source'y/warstwy) jest
    // tym, czego faktycznie potrzebujemy, i jest zalecanym momentem w MapLibre.
    const markLoaded = () => setLoaded(true);
    map.on('style.load', markLoaded);
    map.on('load', markLoaded);

    map.on('movestart', (e) => {
      gestureActiveRef.current = Boolean((e as { originalEvent?: unknown }).originalEvent);
    });
    map.on('move', () => {
      onCameraChangedRef.current?.(buildState(map, gestureActiveRef.current));
    });
    map.on('moveend', () => {
      const state = buildState(map, false);
      gestureActiveRef.current = false;
      onMapIdleRef.current?.(state);
    });

    map.on('click', (e) => {
      const point = e.point;
      const features = map.queryRenderedFeatures(point) as MapGeoJSONFeature[];
      for (const feature of features) {
        const layerId = feature.layer?.id;
        if (!layerId) continue;
        for (const reg of sourcesRef.current.values()) {
          if (reg.getLayerIds().includes(layerId)) {
            // Zbierz WSZYSTKIE cechy tego źródła trafione tym klikiem, nie tylko
            // pierwszą (najwyższą w z-order) — inaczej dwa nachodzące na siebie,
            // nieskastrowane boiska zawsze tracą to "pod spodem": onPress dostawał
            // jednoelementową tablicę i logika wykrywania nakładających się boisk
            // (patrz onFieldPress w map-view.web.tsx) nigdy się nie uruchamiała na
            // wersji webowej, mimo że działa natywnie (tam RN Mapbox sam zwraca
            // wszystkie trafione cechy).
            const sourceLayerIds = new Set(reg.getLayerIds());
            const matches = features.filter((f) => f.layer?.id && sourceLayerIds.has(f.layer.id));
            reg.onPress?.({ features: matches });
            return;
          }
        }
      }
      onPressRef.current?.({
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: [e.lngLat.lng, e.lngLat.lat] },
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
      setLoaded(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const registerSource = useCallback((reg: SourceRegistration) => {
    sourcesRef.current.set(reg.sourceId, reg);
    return () => {
      sourcesRef.current.delete(reg.sourceId);
    };
  }, []);

  const ctx = useMemo<MapCtx>(
    () => ({ map: mapRef.current, loaded, registerSource }),
    [loaded, registerSource],
  );

  return (
    <View style={[styles.fill, style]}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      <MapContext.Provider value={ctx}>{loaded ? children : null}</MapContext.Provider>
    </View>
  );
});

export type CameraImperative = {
  setCamera: (opts: { centerCoordinate?: [number, number]; zoomLevel?: number; animationDuration?: number }) => void;
  fitBounds: (ne: [number, number], sw: [number, number], padding?: number, duration?: number) => void;
};

type CameraProps = {
  centerCoordinate?: [number, number];
  zoomLevel?: number;
  animationMode?: 'flyTo' | 'easeTo' | 'moveTo';
  animationDuration?: number;
  defaultSettings?: { centerCoordinate?: [number, number]; zoomLevel?: number };
};

export const Camera = forwardRef<CameraImperative, CameraProps>(function Camera(
  { centerCoordinate, zoomLevel, animationDuration = 0, defaultSettings },
  ref,
) {
  const { map, loaded } = useMapContext();
  const didInitRef = useRef(false);
  const lastAppliedRef = useRef<string | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      setCamera: ({ centerCoordinate: c, zoomLevel: z, animationDuration: dur = 0 }) => {
        if (!map) return;
        map.flyTo({ center: c as LngLatLike | undefined, zoom: z, duration: dur });
      },
      fitBounds: (ne, sw, padding = 40, duration = 0) => {
        if (!map) return;
        map.fitBounds([sw as LngLatLike, ne as LngLatLike], { padding, duration });
      },
    }),
    [map],
  );

  useEffect(() => {
    if (!map || !loaded || didInitRef.current) return;
    didInitRef.current = true;
    if (defaultSettings?.centerCoordinate) {
      map.jumpTo({
        center: defaultSettings.centerCoordinate as LngLatLike,
        zoom: defaultSettings.zoomLevel ?? map.getZoom(),
      });
    } else if (centerCoordinate) {
      if (animationDuration > 0) {
        map.flyTo({ center: centerCoordinate as LngLatLike, zoom: zoomLevel, duration: animationDuration });
      } else {
        map.jumpTo({ center: centerCoordinate as LngLatLike, zoom: zoomLevel ?? map.getZoom() });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, loaded]);

  useEffect(() => {
    if (!map || !loaded || !didInitRef.current || !centerCoordinate) return;
    const key = `${centerCoordinate[0]},${centerCoordinate[1]},${zoomLevel}`;
    if (lastAppliedRef.current === null) {
      lastAppliedRef.current = key;
      return;
    }
    if (lastAppliedRef.current === key) return;
    lastAppliedRef.current = key;
    map.flyTo({ center: centerCoordinate as LngLatLike, zoom: zoomLevel, duration: animationDuration });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, loaded, centerCoordinate?.[0], centerCoordinate?.[1], zoomLevel]);

  return null;
});

const CIRCLE_LAYOUT = new Set(['circleSortKey']);
const SYMBOL_LAYOUT = new Set([
  'iconAllowOverlap',
  'iconAnchor',
  'iconIgnorePlacement',
  'iconImage',
  'iconKeepUpright',
  'iconOffset',
  'iconOptional',
  'iconPadding',
  'iconPitchAlignment',
  'iconRotate',
  'iconRotationAlignment',
  'iconSize',
  'iconTextFit',
  'iconTextFitPadding',
  'symbolAvoidEdges',
  'symbolPlacement',
  'symbolSortKey',
  'symbolSpacing',
  'symbolZOrder',
  'textAllowOverlap',
  'textAnchor',
  'textField',
  'textFont',
  'textIgnorePlacement',
  'textJustify',
  'textKeepUpright',
  'textLetterSpacing',
  'textLineHeight',
  'textMaxAngle',
  'textMaxWidth',
  'textOffset',
  'textOptional',
  'textPadding',
  'textPitchAlignment',
  'textRadialOffset',
  'textRotate',
  'textRotationAlignment',
  'textSize',
  'textTransform',
  'textVariableAnchor',
  'textWritingMode',
  'visibility',
]);
const LINE_LAYOUT = new Set(['lineCap', 'lineJoin', 'lineMiterLimit', 'lineRoundLimit', 'lineSortKey', 'visibility']);
const FILL_LAYOUT = new Set(['fillSortKey', 'visibility']);

function toKebab(key: string): string {
  return key.replace(/([A-Z])/g, '-$1').toLowerCase();
}

function splitStyle(style: Record<string, unknown>, layoutKeys: Set<string>) {
  const paint: Record<string, unknown> = {};
  const layout: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(style ?? {})) {
    const target = layoutKeys.has(key) ? layout : paint;
    target[toKebab(key)] = value;
  }
  return { paint, layout };
}

type LayerSpec = {
  id: string;
  kind: 'circle' | 'symbol' | 'line' | 'fill';
  filter?: unknown;
  minZoomLevel?: number;
  maxZoomLevel?: number;
  style?: Record<string, unknown>;
};

const ShapeSourceLayerCtx = createContext<{
  addLayer: (spec: LayerSpec) => void;
  removeLayer: (id: string) => void;
} | null>(null);

function useLayerRegistration(spec: LayerSpec) {
  const ctx = useContext(ShapeSourceLayerCtx);
  const specKey = JSON.stringify(spec);
  useEffect(() => {
    if (!ctx) return;
    ctx.addLayer(spec);
    return () => ctx.removeLayer(spec.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, specKey]);
}

type LayerProps = {
  id: string;
  /** Wstrzykiwane automatycznie przez ShapeSource w natywnym RNMapbox; tu nieużywane. */
  sourceID?: string;
  filter?: unknown;
  minZoomLevel?: number;
  maxZoomLevel?: number;
  style?: Record<string, unknown>;
};

export function CircleLayer(props: LayerProps) {
  useLayerRegistration({ ...props, kind: 'circle' });
  return null;
}

export function SymbolLayer(props: LayerProps) {
  useLayerRegistration({ ...props, kind: 'symbol' });
  return null;
}

export function LineLayer(props: LayerProps) {
  useLayerRegistration({ ...props, kind: 'line' });
  return null;
}

export function FillLayer(props: LayerProps) {
  useLayerRegistration({ ...props, kind: 'fill' });
  return null;
}

type ShapeSourceProps = {
  id: string;
  shape: GeoJSON.FeatureCollection | GeoJSON.Feature;
  onPress?: (event: PressEvent) => void;
  cluster?: boolean;
  clusterRadius?: number;
  clusterMaxZoomLevel?: number;
  /** Agregacje liczone przy łączeniu punktów w klaster, np. { open_count: ['+', ['case', ...]] }. */
  clusterProperties?: Record<string, unknown>;
  children?: ReactNode;
};

export type ShapeSourceImperative = {
  getClusterLeaves: (
    feature: GeoJSON.Feature,
    limit: number,
    offset: number,
  ) => Promise<GeoJSON.FeatureCollection>;
  getClusterExpansionZoom: (feature: GeoJSON.Feature) => Promise<number>;
};

export const ShapeSource = forwardRef<ShapeSourceImperative, ShapeSourceProps>(function ShapeSource(
  { id, shape, onPress, cluster, clusterRadius, clusterMaxZoomLevel, clusterProperties, children },
  ref,
) {
  const { map, loaded, registerSource } = useMapContext();
  const layerOrderRef = useRef<string[]>([]);
  const layerSpecsRef = useRef<Map<string, LayerSpec>>(new Map());
  const [, forceRender] = useState(0);
  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;

  useEffect(() => {
    if (!map || !loaded) return;
    if (!map.getSource(id)) {
      map.addSource(id, {
        type: 'geojson',
        data: shape,
        cluster: Boolean(cluster),
        clusterRadius: clusterRadius ?? 50,
        clusterMaxZoom: clusterMaxZoomLevel ?? 14,
        // GeoJSON źródło samo w sobie tnie dane na kafelki tylko do
        // WŁASNEGO `maxzoom` (domyślnie 18 w MapLibre/Mapbox GL JS) —
        // niezależnego od `clusterMaxZoom` powyżej. Bez jawnego ustawienia
        // tego pola klaster przestaje się realnie przeliczać powyżej z18:
        // każdy dalszy zoom tylko powiększa (over-zoom) już wygenerowany
        // kafelek z18, więc dwa punkty, które w z18 mieściły się w
        // `clusterRadius` (bardzo prawdopodobne dla obiektów kilka metrów
        // od siebie — 80px na z18 to dziesiątki metrów), zostają
        // sklastrowane NA ZAWSZE, niezależnie od tego, jak bardzo
        // użytkownik przybliży mapę — `clusterMaxZoom={19}` nigdy realnie
        // nie zadziała, bo nie ma dla z19 żadnego kafelka do wygenerowania.
        // Stąd zgłoszenie 2026-08-16: "nawet na maksymalnym zoomie" bąble
        // się nie rozdzielały. Podbite razem z clusterMaxZoom, z zapasem.
        maxzoom: Math.max((clusterMaxZoomLevel ?? 14) + 2, 20),
        ...(clusterProperties ? { clusterProperties } : null),
      });
    }
    return () => {
      for (const layerId of [...layerOrderRef.current].reverse()) {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
      }
      layerOrderRef.current = [];
      if (map.getSource(id)) map.removeSource(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, loaded, id]);

  useEffect(() => {
    if (!map || !loaded) return;
    const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
    src?.setData(shape as GeoJSON.FeatureCollection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, loaded, JSON.stringify(shape)]);

  useEffect(() => {
    if (!map || !loaded) return;
    return registerSource({
      sourceId: id,
      getLayerIds: () => layerOrderRef.current,
      onPress: (e) => onPressRef.current?.(e),
    });
  }, [map, loaded, id, registerSource]);

  const addLayer = useCallback(
    (spec: LayerSpec) => {
      layerSpecsRef.current.set(spec.id, spec);
      if (!layerOrderRef.current.includes(spec.id)) layerOrderRef.current.push(spec.id);
      forceRender((n) => n + 1);
    },
    [],
  );
  const removeLayer = useCallback((layerId: string) => {
    layerSpecsRef.current.delete(layerId);
    layerOrderRef.current = layerOrderRef.current.filter((l) => l !== layerId);
    if (map?.getLayer(layerId)) map.removeLayer(layerId);
    forceRender((n) => n + 1);
  }, [map]);

  useEffect(() => {
    if (!map || !loaded) return;
    for (const layerId of layerOrderRef.current) {
      const spec = layerSpecsRef.current.get(layerId);
      if (!spec) continue;
      const layoutKeys =
        spec.kind === 'circle'
          ? CIRCLE_LAYOUT
          : spec.kind === 'symbol'
            ? SYMBOL_LAYOUT
            : spec.kind === 'fill'
              ? FILL_LAYOUT
              : LINE_LAYOUT;
      const { paint, layout } = splitStyle(spec.style ?? {}, layoutKeys);
      if (!map.getLayer(layerId)) {
        const layerDef: Record<string, unknown> = {
          id: layerId,
          type: spec.kind,
          source: id,
          paint,
          layout,
        };
        if (spec.filter !== undefined) layerDef.filter = spec.filter;
        if (spec.minZoomLevel !== undefined) layerDef.minzoom = spec.minZoomLevel;
        if (spec.maxZoomLevel !== undefined) layerDef.maxzoom = spec.maxZoomLevel;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        map.addLayer(layerDef as any);
      } else {
        for (const [k, v] of Object.entries(paint)) map.setPaintProperty(layerId, k, v);
        for (const [k, v] of Object.entries(layout)) map.setLayoutProperty(layerId, k, v);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (spec.filter !== undefined) map.setFilter(layerId, spec.filter as any);
      }
    }
  });

  const layerCtx = useMemo(() => ({ addLayer, removeLayer }), [addLayer, removeLayer]);

  useImperativeHandle(
    ref,
    () => ({
      getClusterLeaves: async (feature, limit, offset) => {
        const src = map?.getSource(id) as maplibregl.GeoJSONSource | undefined;
        const clusterId = feature.properties?.cluster_id;
        if (!src || clusterId == null) {
          return { type: 'FeatureCollection', features: [] };
        }
        const features = await src.getClusterLeaves(clusterId, limit, offset);
        return { type: 'FeatureCollection', features } as GeoJSON.FeatureCollection;
      },
      getClusterExpansionZoom: async (feature) => {
        const src = map?.getSource(id) as maplibregl.GeoJSONSource | undefined;
        const clusterId = feature.properties?.cluster_id;
        if (!src || clusterId == null) return 0;
        return src.getClusterExpansionZoom(clusterId);
      },
    }),
    [map, id],
  );

  return <ShapeSourceLayerCtx.Provider value={layerCtx}>{children}</ShapeSourceLayerCtx.Provider>;
});

/** Wyciąga URI z tego, co pod webowym Metro zwraca `require('*.png')` (string, {uri}, lub {default: ...}). */
function resolveImageUri(source: unknown): string | undefined {
  if (typeof source === 'string') return source;
  if (source && typeof source === 'object') {
    const obj = source as Record<string, unknown>;
    if (typeof obj.uri === 'string') return obj.uri;
    if ('default' in obj) return resolveImageUri(obj.default);
  }
  return undefined;
}

export function Images({ images }: { images: Record<string, ImageEntry> }) {
  const { map, loaded } = useMapContext();
  useEffect(() => {
    if (!map || !loaded) return;
    let cancelled = false;
    for (const [name, entry] of Object.entries(images)) {
      if (map.hasImage(name)) continue;
      const uri = resolveImageUri(entry.image);
      if (!uri) continue;
      const imgEl = new window.Image();
      imgEl.crossOrigin = 'anonymous';
      imgEl.onload = () => {
        if (cancelled || map.hasImage(name)) return;
        try {
          map.addImage(name, imgEl, { pixelRatio: entry.scale ?? 1 });
        } catch {
          // ignoruj wyścig przy Fast Refresh
        }
      };
      imgEl.src = uri;
    }
    return () => {
      cancelled = true;
    };
  }, [map, loaded, images]);
  return null;
}

let puckStylesInjected = false;
function ensurePuckStyles() {
  if (puckStylesInjected || typeof document === 'undefined') return;
  puckStylesInjected = true;
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    .app-location-puck { position: relative; width: 18px; height: 18px; }
    .app-location-puck-dot {
      position: absolute; inset: 0; margin: auto; width: 14px; height: 14px;
      background: #1f6bff; border: 2px solid #fff; border-radius: 50%;
      box-shadow: 0 0 0 1px rgba(0,0,0,0.15);
    }
    .app-location-puck-halo {
      position: absolute; inset: 0; margin: auto; width: 14px; height: 14px;
      border-radius: 50%; background: rgba(31,107,255,0.35);
      animation: app-location-puck-pulse 2s ease-out infinite;
    }
    @keyframes app-location-puck-pulse {
      0% { transform: scale(1); opacity: 0.7; }
      100% { transform: scale(2.6); opacity: 0; }
    }
  `;
  document.head.appendChild(styleEl);
}

export function LocationPuck(_props: { pulsing?: 'default' | boolean }) {
  const { map, loaded } = useMapContext();
  const markerRef = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    if (!map || !loaded || typeof navigator === 'undefined' || !navigator.geolocation) return;
    ensurePuckStyles();
    const el = document.createElement('div');
    el.className = 'app-location-puck';
    el.innerHTML = '<div class="app-location-puck-dot"></div><div class="app-location-puck-halo"></div>';
    const marker = new maplibregl.Marker({ element: el }).setLngLat([0, 0]);
    markerRef.current = marker;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        marker.setLngLat([pos.coords.longitude, pos.coords.latitude]);
        if (!marker.getElement().isConnected) marker.addTo(map);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 },
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      marker.remove();
      markerRef.current = null;
    };
  }, [map, loaded]);

  return null;
}

type MarkerViewProps = {
  id?: string;
  coordinate: [number, number];
  anchor?: { x: number; y: number };
  allowOverlap?: boolean;
  children?: ReactNode;
};

function anchorFromFraction(anchor?: { x: number; y: number }): maplibregl.PositionAnchor {
  if (!anchor) return 'center';
  const { x, y } = anchor;
  const v = y <= 0.25 ? 'top' : y >= 0.75 ? 'bottom' : '';
  const h = x <= 0.25 ? 'left' : x >= 0.75 ? 'right' : '';
  const combined = `${v}${h ? (v ? '-' : '') + h : ''}`;
  return (combined || 'center') as maplibregl.PositionAnchor;
}

export function MarkerView({ coordinate, anchor, children }: MarkerViewProps) {
  const { map, loaded } = useMapContext();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    if (!map || !loaded) return;
    const el = document.createElement('div');
    const marker = new maplibregl.Marker({ element: el, anchor: anchorFromFraction(anchor) })
      .setLngLat(coordinate)
      .addTo(map);
    markerRef.current = marker;
    setContainer(el);
    return () => {
      marker.remove();
      markerRef.current = null;
      setContainer(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, loaded]);

  useEffect(() => {
    markerRef.current?.setLngLat(coordinate);
  }, [coordinate]);

  if (!container) return null;
  return createPortal(children, container);
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
});
