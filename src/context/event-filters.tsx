import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

import { useUserLocation } from '@/hooks/use-user-location';
import { invalidateFieldCoordsCache } from '@/lib/event-field-coords';
import {
  applyEventFilters,
  countActiveEventFilters,
  countFilteredEventsByField,
  DEFAULT_EVENT_FILTERS,
  isDefaultEventFilters,
  type EventFilters,
} from '@/lib/event-filters';
import { getFilterableEvents, type FilterableEventListItem } from '@/lib/events';

type EventFiltersContextValue = {
  filters: EventFilters;
  setFilters: (patch: Partial<EventFilters>) => void;
  resetFilters: () => void;
  allEvents: FilterableEventListItem[];
  filteredEvents: FilterableEventListItem[];
  countsByFieldId: Map<string, number>;
  activeFilterCount: number;
  loading: boolean;
  loadError: boolean;
  refreshEvents: () => Promise<void>;
};

const EventFiltersContext = createContext<EventFiltersContextValue | null>(null);

export function EventFiltersProvider({ children }: PropsWithChildren) {
  const { coords } = useUserLocation();
  const [filters, setFiltersState] = useState<EventFilters>(DEFAULT_EVENT_FILTERS);
  const [allEvents, setAllEvents] = useState<FilterableEventListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const refreshEvents = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      invalidateFieldCoordsCache();
      const { data, error } = await getFilterableEvents();
      setAllEvents(data);
      setLoadError(Boolean(error));
    } catch {
      setAllEvents([]);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshEvents();
  }, [refreshEvents]);

  const setFilters = useCallback((patch: Partial<EventFilters>) => {
    setFiltersState((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState(DEFAULT_EVENT_FILTERS);
  }, []);

  const filteredEvents = useMemo(
    () =>
      applyEventFilters(allEvents, filters, {
        userCoords: coords,
      }),
    [allEvents, coords, filters],
  );

  const countsByFieldId = useMemo(
    () => countFilteredEventsByField(filteredEvents),
    [filteredEvents],
  );

  const value = useMemo<EventFiltersContextValue>(
    () => ({
      filters,
      setFilters,
      resetFilters,
      allEvents,
      filteredEvents,
      countsByFieldId,
      activeFilterCount: isDefaultEventFilters(filters) ? 0 : countActiveEventFilters(filters),
      loading,
      loadError,
      refreshEvents,
    }),
    [
      filters,
      setFilters,
      resetFilters,
      allEvents,
      filteredEvents,
      countsByFieldId,
      loading,
      loadError,
      refreshEvents,
    ],
  );

  return (
    <EventFiltersContext.Provider value={value}>{children}</EventFiltersContext.Provider>
  );
}

export function useEventFilters(): EventFiltersContextValue {
  const ctx = useContext(EventFiltersContext);
  if (!ctx) {
    throw new Error('useEventFilters musi być użyte wewnątrz <EventFiltersProvider />');
  }
  return ctx;
}
