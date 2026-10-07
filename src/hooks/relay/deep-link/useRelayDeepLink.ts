'use client';

/**
 * The `?relay=` deep link (and the `/r/<code>` share route, which lands on
 * it) used to switch relays on sight. `switchRelay` is the one path that
 * activates a relay, and everything the new relay learns happens inside
 * it: the socket opens, NIP-42 AUTH answers with a signed kind 22242 (the
 * pubkey, from the victim's IP), the relay is appended to the rail list and
 * to the recent-relays MRU the background watch reads. One click on a
 * crafted link did all of that for a relay the user had never heard of.
 *
 * This hook is the gate, and both shells go through it. The order is the
 * fix: for a relay that is not already in the user's list, the dialog is
 * awaited *before* `switchRelay` is called, so nothing reaches the bridge,
 * and therefore nothing reaches the relay or the disk, until the user says
 * yes. A relay already in the list switches as it always did.
 */
import { useCallback, useEffect, useRef } from 'react';
import { nostrActions, useAwaitBridge, type BridgeImpl } from '@/services/nostr-bridge';
import { confirmDialog } from '@/services/common/confirm-dialog';
import { useTranslations } from 'next-intl';
import { type DeepLinkRelayOutcome, type RelayState, switchToDeepLinkedRelay } from '@/services/relay/deep-link';

/**
 * The first value a bridge subscription emits. The bridge's stores call
 * the listener synchronously on subscribe, so this reads the live value
 * rather than the hook's `[]` placeholder, which is what the shells had on
 * first render.
 */
function firstValue<T>(subscribe: (cb: (value: T) => void) => () => void): T {
  let value: T | undefined;
  let seen = false;
  const unsubscribe = subscribe((next) => {
    value = next;
    seen = true;
  });
  unsubscribe();
  if (!seen) throw new Error('bridge subscription did not emit its current value');
  return value as T;
}

async function readBridgeRelayState(awaitBridge: () => Promise<BridgeImpl>): Promise<RelayState> {
  const bridge = await awaitBridge();
  return {
    current: firstValue<string>((cb) => bridge.subscribeCurrentRelayUrl(cb)),
    configured: firstValue<ReadonlyArray<string>>((cb) => bridge.subscribeConfiguredRelays(cb)),
  };
}

/**
 * Returns a stable `switchFromDeepLink(requested)` for the shells' mount
 * effects. Stable on purpose: both shells run their URL parse once, in an
 * effect with no dependencies, and a callback that changed identity would
 * either be stale or re-run the parse.
 */
export function useRelayDeepLink(): (requested: string) => Promise<DeepLinkRelayOutcome> {
  const t = useTranslations();
  // Read through a ref so the callback can stay stable across locale changes.
  const translate = useRef(t);
  useEffect(() => { translate.current = t; }, [t]);
  // The shells call this from a mount effect, before the provider has the
  // bridge; the read waits for it. Stable, like the callback.
  const awaitBridge = useAwaitBridge();
  return useCallback((requested: string) => switchToDeepLinkedRelay({
    requested,
    readRelayState: () => readBridgeRelayState(awaitBridge),
    confirm: (host) => confirmDialog({
      title: translate.current('common.deeplink.relay.title', { host }),
      message: translate.current('common.deeplink.relay.body'),
      confirmLabel: translate.current('common.deeplink.relay.connect'),
      tone: 'default',
      icon: 'none',
    }),
    switchRelay: (url) => nostrActions.switchRelay(url),
  }), [awaitBridge]);
}
