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
import { getBridge, nostrActions } from '@/services/nostr-bridge';
import { confirmDialog } from '@/services/confirm-dialog';
import { shortHost } from '@/utils/relay-url/url-host';
import { useTranslations } from 'next-intl';

export type DeepLinkRelayOutcome = 'unchanged' | 'switched' | 'declined' | 'failed';

export type DeepLinkRelayClass = 'current' | 'known' | 'unknown';

/** `relay.example`, `wss://relay.example/` and `WSS://Relay.Example` are one relay. */
export function normalizeDeepLinkRelay(raw: string): string {
  const withScheme = /^wss?:\/\//i.test(raw) ? raw : `wss://${raw}`;
  return withScheme.replace(/\/+$/, '').toLowerCase();
}

function sameRelay(a: string | null | undefined, b: string): boolean {
  return !!a && normalizeDeepLinkRelay(a) === b;
}

/**
 * What a deep link to `requested` may do, given what the user already has.
 * Pure, so the shells can also use it for the one synchronous decision they
 * need (which relay to stamp into the seeded history) without reaching for
 * the bridge.
 */
export function classifyDeepLinkRelay(
  requested: string,
  current: string | null | undefined,
  configured: ReadonlyArray<string>,
): DeepLinkRelayClass {
  const target = normalizeDeepLinkRelay(requested);
  if (sameRelay(current, target)) return 'current';
  if (configured.some((url) => sameRelay(url, target))) return 'known';
  return 'unknown';
}

export interface RelayState {
  readonly current: string;
  readonly configured: ReadonlyArray<string>;
}

export interface DeepLinkRelayDeps {
  readonly requested: string;
  readonly readRelayState: () => Promise<RelayState>;
  /** Asks the user. Resolves `false` to leave everything as it was. */
  readonly confirm: (host: string) => Promise<boolean>;
  readonly switchRelay: (url: string) => Promise<void>;
}

/**
 * The gate itself, with its collaborators injected so a test can prove the
 * ordering: `switchRelay` is never called before `confirm` has resolved
 * `true` for a relay outside the list.
 */
export async function switchToDeepLinkedRelay(deps: DeepLinkRelayDeps): Promise<DeepLinkRelayOutcome> {
  const target = normalizeDeepLinkRelay(deps.requested);
  const state = await deps.readRelayState();
  const kind = classifyDeepLinkRelay(target, state.current, state.configured);
  if (kind === 'current') return 'unchanged';
  if (kind === 'unknown') {
    const accepted = await deps.confirm(shortHost(target));
    if (!accepted) return 'declined';
  }
  try {
    await deps.switchRelay(target);
    return 'switched';
  } catch (err) {
    console.warn('[deep-link] switchRelay failed', err);
    return 'failed';
  }
}

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

async function readBridgeRelayState(): Promise<RelayState> {
  const bridge = await getBridge();
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
  return useCallback((requested: string) => switchToDeepLinkedRelay({
    requested,
    readRelayState: readBridgeRelayState,
    confirm: (host) => confirmDialog({
      title: translate.current('common.deeplink.relay.title', { host }),
      message: translate.current('common.deeplink.relay.body'),
      confirmLabel: translate.current('common.deeplink.relay.connect'),
      tone: 'default',
      icon: 'none',
    }),
    switchRelay: (url) => nostrActions.switchRelay(url),
  }), []);
}
