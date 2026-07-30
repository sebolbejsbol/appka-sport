import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppMap } from '@/components/map-view';
import { Brand } from '@/constants/theme';
import { useEventFilters } from '@/context/event-filters';
import { requestMapFieldsRefresh } from '@/lib/map-field-sync';

export default function HomeScreen() {
  const { refreshEvents } = useEventFilters();

  useFocusEffect(
    useCallback(() => {
      requestMapFieldsRefresh();
      void refreshEvents();
    }, [refreshEvents]),
  );

  return (
    <View style={styles.container}>
      <AppMap />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Brand.screenBackground,
  },
});
