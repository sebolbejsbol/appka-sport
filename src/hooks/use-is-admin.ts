import { useEffect, useState } from 'react';

import { useSession } from '@/context/session';
import { getProfileAdminFlag } from '@/lib/profiles';

export function useIsAdmin(): { isAdmin: boolean | null; loading: boolean } {
  const { session } = useSession();
  const userId = session?.user?.id;
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (!userId) {
      setIsAdmin(false);
      return;
    }

    let active = true;
    getProfileAdminFlag(userId).then(({ isAdmin: admin }) => {
      if (active) setIsAdmin(admin);
    });

    return () => {
      active = false;
    };
  }, [userId]);

  return { isAdmin, loading: isAdmin === null && Boolean(userId) };
}
