'use client';

import { useMemo } from 'react';
import { topReactors } from '@/utils/shell/panes/message/hover-cards';

/** The people behind one reaction pill, capped for the hover card. */
export function useReactorHoverCard(pubkeys: ReadonlySet<string>) {
  return useMemo(() => topReactors(pubkeys), [pubkeys]);
}
