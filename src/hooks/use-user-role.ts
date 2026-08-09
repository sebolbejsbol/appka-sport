import { useEffect, useState } from 'react';

import { useSession } from '@/context/session';
import { getProfileRole, type AppRole } from '@/lib/profiles';

export function useUserRole(): {
  role: AppRole | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  loading: boolean;
} {
  const { session } = useSession();
  const userId = session?.user?.id;
  const [role, setRole] = useState<AppRole | null>(null);

  useEffect(() => {
    if (!userId) {
      setRole('user');
      return;
    }

    let active = true;
    getProfileRole(userId).then(({ role: fetchedRole }) => {
      if (active) setRole(fetchedRole);
    });

    return () => {
      active = false;
    };
  }, [userId]);

  return {
    role,
    isAdmin: role === 'admin' || role === 'super_admin',
    isSuperAdmin: role === 'super_admin',
    loading: role === null && Boolean(userId),
  };
}
