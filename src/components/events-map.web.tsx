import Mapbox, {
  Camera,
  CircleLayer,
  Images,
  LocationPuck,
  MapView,
  MarkerView,
  ShapeSource,
  SymbolLayer,
} from '@/lib/map-kit-web';
import { useCallback, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View, Image } from 'react-native';

import { Brand } from '@/constants/theme';
import type { DiscoverEvent } from '@/lib/discover-events';
import { groupEventsByVenue, soonestEvent } from '@/lib/discover-events-venue-points';
import { POLAND_CENTER } from '@/lib/map-bbox';
import { mapFieldIcons } from '@/lib/map-field-icons';
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
import { fieldMarkerIcon } from '@/lib/sports';
import type { TournamentListItem } from '@/lib/tournaments';
import type { LngLat } from '@/hooks/use-user-location';

type Props = {
  events: DiscoverEvent[];
  tournaments: TournamentListItem[];
  userCoords: LngLat | null;
  onSelectEvent: (event: DiscoverEvent) => void;
  onSelectTournament: (tournament: TournamentListItem) => void;
};

/**
 * Klaster/pojedynczy obiekt (nie pojedynczy event!) — dokładnie ten sam język
 * wizualny co główna mapa: czarne kółko, kolorowa obwódka statusu, ikona
 * kategorii obok liczby eventów. Event to WYŁĄCZNIE dane zasilające wygląd
 * punktu, do którego fizycznie należy (patrz groupEventsByVenue) — nigdy
 * własny, osobny marker na mapie.
 */
const CLUSTER_AVAILABILITY_PROPERTIES = {
  total_events: ['+', ['get', 'event_count']],
  open_count: ['+', ['case', ['==', ['get', 'availability'], 'open'], 1, 0]],
  filling_count: ['+', ['case', ['==', ['get', 'availability'], 'filling'], 1, 0]],
  full_count: ['+', ['case', ['==', ['get', 'availability'], 'full'], 1, 0]],
  ...buildClusterCategoryProperties(),
};

function venuePointsToGeoJSON(points: ReturnType<typeof groupEventsByVenue>['points']) {
  return {
    type: 'FeatureCollection' as const,
    features: points.map((p) => ({
      type: 'Feature' as const,
      id: p.id,
      properties: {
        id: p.id,
        sport: p.sport,
        event_count: p.eventCount,
        availability: p.availability,
        icon: fieldMarkerIcon(p.sport),
      },
      geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
    })),
  };
}

export function EventsMap({ events, tournaments, userCoords, onSelectEvent, onSelectTournament }: Props) {
  const cameraRef = useRef<unknown>(null);

  const { points, eventsByVenue } = useMemo(() => groupEventsByVenue(events), [events]);
  const shape = useMemo(() => venuePointsToGeoJSON(points), [points]);

  const center = userCoords ?? POLAND_CENTER;
  const zoom = userCoords ? 11 : 6;

  const onPress = useCallback(
    (event: { features?: GeoJSON.Feature[] }) => {
      const feature = event.features?.[0];
      if (!feature) return;
      // Klaster (wiele obiektów) — bez akcji, użytkownik przybliża ręcznie, tak
      // jak na głównej mapie punkty rozdzielają się naturalnie przy zoomie.
      if (feature.properties?.point_count != null) return;

      const id = feature.properties?.id;
      if (typeof id !== 'string') return;
      const match = soonestEvent(eventsByVenue.get(id) ?? []);
      if (match) onSelectEvent(match);
    },
    [eventsByVenue, onSelectEvent],
  );

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        styleURL={Mapbox.StyleURL.Street}
        logoEnabled={false}
        attributionEnabled={false}
        scaleBarEnabled={false}
        compassEnabled={false}>
        <Camera
          ref={cameraRef}
          centerCoordinate={center}
          zoomLevel={zoom}
          animationMode="flyTo"
          animationDuration={800}
        />

        <Images images={mapFieldIcons} />

        <ShapeSource
          id="event-venues"
          shape={shape}
          onPress={onPress}
          cluster
          clusterRadius={80}
          clusterMaxZoomLevel={16}
          clusterProperties={CLUSTER_AVAILABILITY_PROPERTIES}>
          <CircleLayer
            id="event-venues-clusters-halo"
            filter={['has', 'point_count']}
            style={{
              circleRadius: ['interpolate', ['linear'], ['get', 'total_events'], 1, 30, 5, 34, 15, 38, 40, 44],
              circleColor: buildClusterStatusColorExpression(),
              circleBlur: 1.1,
              circleOpacity: 0.6,
            }}
          />
          <CircleLayer
            id="event-venues-clusters"
            filter={['has', 'point_count']}
            style={{
              circleRadius: ['interpolate', ['linear'], ['get', 'total_events'], 1, 24, 5, 28, 15, 32, 40, 38],
              circleColor: BUBBLE_CENTER_COLOR,
              circleStrokeWidth: 4,
              circleStrokeColor: buildClusterStatusColorExpression(),
            }}
          />
          <SymbolLayer
            id="event-venues-cluster-count"
            filter={['has', 'point_count']}
            style={{
              textField: ['get', 'total_events'],
              textSize: 15,
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
              większy bąbel -> większe ikony). */}
          {([0, 1, 2, 3] as const).map((slot) => (
            <SymbolLayer
              key={`event-venues-cluster-icon-slot-${slot}`}
              id={`event-venues-cluster-icon-slot-${slot}`}
              filter={['all', ['has', 'point_count'], buildClusterIconSlotVisibleFilter(slot)]}
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
          <CircleLayer
            id="event-venue-ring"
            filter={['!', ['has', 'point_count']]}
            style={{
              circleRadius: 22,
              circleColor: BUBBLE_CENTER_COLOR,
              circleStrokeWidth: 4,
              circleStrokeColor: buildAvailabilityMatchExpression(),
            }}
          />
          <SymbolLayer
            id="event-venue-icon"
            filter={['!', ['has', 'point_count']]}
            style={{
              iconImage: ['get', 'icon'],
              iconSize: 0.42,
              iconOffset: [-10, 0],
              iconAllowOverlap: true,
              iconIgnorePlacement: true,
              iconPitchAlignment: 'viewport',
            }}
          />
          <SymbolLayer
            id="event-venue-count"
            filter={['!', ['has', 'point_count']]}
            style={{
              textField: ['get', 'event_count'],
              textSize: 16,
              textColor: '#ffffff',
              textOffset: [0.7, 0],
              textAllowOverlap: true,
              textIgnorePlacement: true,
              textPitchAlignment: 'viewport',
            }}
          />
        </ShapeSource>

        {tournaments
          .filter((tItem) => tItem.latitude != null && tItem.longitude != null)
          .map((tItem) => (
            <MarkerView
              key={tItem.id}
              coordinate={[tItem.longitude as number, tItem.latitude as number]}
              anchor={{ x: 0.5, y: 1 }}
              allowOverlap>
              <Pressable onPress={() => onSelectTournament(tItem)} hitSlop={8}>
                <Text style={styles.tournamentPin}>🏆</Text>
              </Pressable>
            </MarkerView>
          ))}

        {userCoords ? <LocationPuck pulsing="default" /> : null}
      </MapView>

      <Image
        source={require('../../assets/images/dudieday-logo.png')}
        style={styles.brandWatermark}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tournamentPin: {
    fontSize: 30,
  },
  container: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: Brand.surfaceMuted,
  },
  map: {
    flex: 1,
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
});
