'use client';

import type { ReactNode } from 'react';
import { useDmOptInEnabled } from '@/hooks/chat/dm/unlock/useDmOptInEnabled';
import DmOptInGate, { type DmOptInGateProps } from './DmOptInGate';

/** Its children once DMs are on for this device; the opt-in card until then. */
export function DMOptInBoundary({
  children,
  surface = 'desktop',
  secondaryLabel,
  onEnable,
  onSecondary,
}: DmOptInGateProps & { children: ReactNode }) {
  const enabled = useDmOptInEnabled();
  if (!enabled) {
    return (
      <DmOptInGate
        surface={surface}
        secondaryLabel={secondaryLabel}
        onEnable={onEnable}
        onSecondary={onSecondary}
      />
    );
  }
  return <>{children}</>;
}
