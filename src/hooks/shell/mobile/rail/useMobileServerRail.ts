'use client';

import { isActiveRelay } from '@/utils/shell/mobile/rail';

/** The phone's relay rail (`mobile/rail/MobileServerRail.tsx`): which tile is the active relay. */
export function useMobileServerRail(activeRelay: string | null) {
  return {
    isActive: (url: string) => isActiveRelay(url, activeRelay),
  };
}
