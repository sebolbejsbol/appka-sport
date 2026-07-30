import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useSession } from '@/context/session';
import { touchLastSeen } from '@/lib/social';

const INTERVAL_MS = 60_000;

/** Aktualizuje last_seen_at — status online dla innych użytkowników. */
export function usePresenceHeartbeat(): void {
  const { session } = useSession();
  const userId = session?.user?.id;

  useEffect(() => {
    if (!userId) return;

    let interval: ReturnType<typeof setInterval> | null = null;

    function ping() {
      void touchLastSeen();
    }

    function onAppState(next: AppStateStatus) {
      if (next === 'active') {
        ping();
      }
    }

    ping();
    interval = setInterval(ping, INTERVAL_MS);
    const sub = AppState.addEventListener('change', onAppState);

    return () => {
      if (interval) clearInterval(interval);
      sub.remove();
    };
  }, [userId]);
}
