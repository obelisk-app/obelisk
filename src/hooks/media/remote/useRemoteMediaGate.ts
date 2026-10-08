'use client';

/**
 * React side of `services/media/remote-media.ts`: joins the policy to the bridge (own
 * pubkey, follows) and the WoT engine, and gives a message component one
 * boolean plus a per-message reveal.
 */

import { useCallback, useState, useSyncExternalStore } from 'react';
import { useMyFollowSet } from '@/services/nostr-bridge';
import { useMyPubkey } from '@/hooks/session/useSession';
import { wotEngine } from '@/services/wot/engine';
import { mayAutoLoadRemoteMedia, type RemoteMediaSurface } from '@/services/media/remote-media';
import { useRemoteMediaSettings } from '@/hooks/media/remote/useRemoteMediaSettings';

export interface RemoteMediaGate {
  /** Render sender-chosen media now (policy allows it, or the reader asked). */
  show: boolean;
  /** `true` when the policy alone would hide it; the placeholder's cue. */
  gated: boolean;
  /** Reveal this message's media. Sticky for the component's lifetime. */
  reveal: () => void;
}

/**
 * @param surface  Which default applies (`channel` or `dm`).
 * @param sender   The message author's pubkey, or `null`/`undefined` when
 *                 the caller does not know it (treated as a stranger).
 * @param own      The reader wrote the message. Defaults to comparing
 *                 `sender` with the bridge identity.
 */
export function useRemoteMediaGate(
  surface: RemoteMediaSurface,
  sender: string | null | undefined,
  own?: boolean,
): RemoteMediaGate {
  const settings = useRemoteMediaSettings();
  const me = useMyPubkey();
  const follows = useMyFollowSet();
  const [revealed, setRevealed] = useState(false);
  const pubkey = sender ?? null;
  const isOwn = own ?? (pubkey !== null && me !== null && pubkey === me);
  const mode = settings[surface];
  const needsWot = mode === 'contacts' && !isOwn && pubkey !== null && !follows.has(pubkey);
  const subscribe = useCallback((onChange: () => void) => (
    needsWot ? wotEngine.on('verdicts-changed', onChange) : () => {}
  ), [needsWot]);
  // The engine broadcasts every resolved batch. Select this row's policy
  // result so another author's verdict never repaints all mounted media.
  const allowed = useSyncExternalStore(
    subscribe,
    () => mayAutoLoadRemoteMedia(mode, { pubkey, own: isOwn }, {
      follows, wotDistance: (pk) => wotEngine.getDistance(pk),
    }),
    () => mayAutoLoadRemoteMedia(mode, { pubkey, own: isOwn }, { follows }),
  );
  const reveal = useCallback(() => setRevealed(true), []);
  return { show: allowed || revealed, gated: !allowed, reveal };
}
