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
import { useMemo, useRef } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Brand } from '@/constants/theme';
import { categoryMeta, eventMarkerIcon, markerEmoji } from '@/lib/event-categories';
import type { DiscoverEvent } from '@/lib/discover-events';
import { POLAND_CENTER } from '@/lib/map-bbox';
import { mapEventIcons } from '@/lib/map-event-icons';
import type { TournamentListItem } from '@/lib/tournaments';
import type { LngLat } from '@/hooks/use-user-location';

type Props = {
  events: DiscoverEvent[];
  tournaments: TournamentListItem[];
  userCoords: LngLat | null;
  onSelectEvent: (event: DiscoverEvent) => void;
  onSelectTournament: (tournament: TournamentListItem) => void;
};

function toGeoJSON(events: DiscoverEvent[]) {
  return {
    type: 'FeatureCollection' as const,
    features: events
      .filter((e) => e.lng != null && e.lat != null)
      .map((e) => {
        const meta = categoryMeta(e.category);
        return {
          type: 'Feature' as const,
          id: e.id,
          geometry: { type: 'Point' as const, coordinates: [e.lng as number, e.lat as number] },
          properties: {
            id: e.id,
            color: meta.color,
            emoji: markerEmoji(e.category, e.subcategory),
            icon: eventMarkerIcon(e.category, e.subcategory),
            instant: e.is_instant ? 1 : 0,
          },
        };
      }),
  };
}

export function EventsMap({ events, tournaments, userCoords, onSelectEvent, onSelectTournament }: Props) {
  const cameraRef = useRef<unknown>(null);
  const shape = useMemo(() => toGeoJSON(events), [events]);

  const center = userCoords ?? POLAND_CENTER;
  const zoom = userCoords ? 11 : 6;

  function onPress(event: { features?: GeoJSON.Feature[] }) {
    const id = event.features?.[0]?.properties?.id;
    if (typeof id !== 'string') return;
    const match = events.find((e) => e.id === id);
    if (match) onSelectEvent(match);
  }

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

        <Images images={mapEventIcons} />

        <ShapeSource id="discover-events" shape={shape} onPress={onPress}>
          <CircleLayer
            id="discover-event-instant"
            filter={['==', ['get', 'instant'], 1]}
            style={{
              circleRadius: 20,
              circleColor: '#16a34a',
              circleBlur: 0.5,
              circleOpacity: 0.5,
            }}
          />
          <SymbolLayer
            id="discover-event-icon"
            style={{
              iconImage: ['get', 'icon'],
              iconSize: 0.9,
              iconAllowOverlap: true,
              iconIgnorePlacement: true,
              iconPitchAlignment: 'viewport',
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
