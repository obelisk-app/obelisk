'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';
import type { TradeResource } from 'vesta';
import type { ResourceCounts } from '@/utils/games/vesta/resources';
import { clampDraft } from '@/utils/games/vesta/vesta-actions';

/**
 * A draft of resource counts that never shows more than its cap. When the cap
 * drops under a drafted count (the robber took a card, a discard, a build),
 * the count is lowered to the cap with no press, and it stays lowered if the
 * cap grows back.
 *
 * The draft returned is derived from the stored one and the cap, so this
 * render already shows the corrected count; the stored draft is brought down
 * to it during render (React's "adjust state when a prop changes" pattern,
 * as `useStagePin` does), not in an effect. `clampDraft` hands back the same
 * object once nothing is over, so the adjustment runs once per drop.
 */
export function useCappedDraft(
  cap: (resource: TradeResource) => number,
): [ResourceCounts, Dispatch<SetStateAction<ResourceCounts>>] {
  const [draft, setDraft] = useState<ResourceCounts>({});
  const shown = clampDraft(draft, cap);
  if (shown !== draft) setDraft(shown);
  return [shown, setDraft];
}
