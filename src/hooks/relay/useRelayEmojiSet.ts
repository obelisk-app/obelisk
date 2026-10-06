'use client';

import { useEffect, useMemo, useState } from 'react';
import { EMPTY_RELAY_EMOJI_SET, subscribeRelayEmojiSet, type RelayEmojiSet } from '@/services/relay-emojis';

/**
 * The operator's emoji set for `relayUrl`, or the empty set until it arrives.
 * Stamped with the relay and authors it came from, so another relay or
 * another operator reads as empty from the first render.
 */
export function useRelayEmojiSet(
  relayUrl: string | null,
  authors: ReadonlyArray<string>,
): RelayEmojiSet {
  const authorsKey = [...authors].sort().join(',');
  const authorList = useMemo(() => (authorsKey ? authorsKey.split(',') : []), [authorsKey]);
  const stateKey = `${relayUrl ?? ''}|${authorsKey}`;
  const [state, setState] = useState<{ key: string; set: RelayEmojiSet }>({
    key: '',
    set: EMPTY_RELAY_EMOJI_SET,
  });
  useEffect(() => {
    if (!relayUrl || authorList.length === 0) return;
    return subscribeRelayEmojiSet(relayUrl, authorList, (set) => setState({ key: stateKey, set }));
  }, [relayUrl, authorList, stateKey]);
  return state.key === stateKey ? state.set : EMPTY_RELAY_EMOJI_SET;
}
