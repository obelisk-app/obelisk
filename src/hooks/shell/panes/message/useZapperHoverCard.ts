'use client';

import { useMemo } from 'react';
import type { MessageZapTotal } from '@/hooks/chat/zaps/useMessageZaps';
import { topZappers } from '@/utils/shell/panes/message/hover-cards';

/** The zappers behind a message's zap pill, largest first, capped for the hover card. */
export function useZapperHoverCard(zapTotal: MessageZapTotal) {
  return useMemo(() => topZappers(zapTotal.zapperAmounts), [zapTotal]);
}
