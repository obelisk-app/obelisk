'use client';

import { useEffect, useState } from 'react';
import { subscribeBotCommands, type BotCommandSet } from '@/services/relay/bot-commands';

const EMPTY: BotCommandSet[] = [];

export function useBotCommands(relayUrl: string | null): BotCommandSet[] {
  // Keyed by relay so switching relays never shows the previous one's bots.
  const [state, setState] = useState<{ relay: string | null; sets: BotCommandSet[] }>({ relay: null, sets: [] });
  useEffect(() => {
    if (!relayUrl) return;
    return subscribeBotCommands(relayUrl, (sets) => setState({ relay: relayUrl, sets }));
  }, [relayUrl]);
  return state.relay === relayUrl ? state.sets : EMPTY;
}
