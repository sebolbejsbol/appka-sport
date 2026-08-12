import type { ReactNode } from 'react';

/**
 * Ta apka jest zaprojektowana mobile-first (natywny RN), ale na webie ma
 * wypełniać całe okno przeglądarki, a nie siedzieć w wyśrodkowanej,
 * "telefonopodobnej" karcie. Powyżej DESKTOP_NAV_BREAKPOINT
 * <AppMenuProvider /> (app-side-menu.tsx) sam dokłada stały pasek boczny
 * obok treści — tu nie ma już żadnego dodatkowego ograniczenia szerokości.
 */
export const DESKTOP_NAV_BREAKPOINT = 760;

export function WebAppShell({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
