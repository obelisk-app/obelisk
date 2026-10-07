/**
 * Following a `?relay=` deep link: switch to the relay, asking first when it
 * is not one of the person's own (`useRelayDeepLink` wires it to the bridge).
 */
import { shortHost } from '@/utils/relay-url/url-host';
import { normalizeDeepLinkRelay, classifyDeepLinkRelay } from '@/utils/relay/deep-link';

export type DeepLinkRelayOutcome = 'unchanged' | 'switched' | 'declined' | 'failed';

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
