/**
 * The session-level state every lifecycle module reads and the login,
 * connection and relay-rail modules write (round 4 plan, §4 "genuinely
 * shared"): who is logged in, the relay being browsed, and the stores the
 * shells and the login gate observe. `BridgeImpl` owns one instance and
 * exposes the stores as properties; the modules' `BridgeContext` closures
 * read `session` and `relays` from it live.
 */
import { DEFAULT_RELAY, DEFAULT_RELAYS } from '@/constants/nostr-bridge/relay';
import type { PersistedSession } from './session-storage';
import { StateStore } from '../common/state-store';
import { clearDecryptCache } from '../cache/decrypt-cache';
import type { RelayAccessState } from '../common/types';
import type { SessionNotice } from './vault';

export type LoginMethod = 'nsec' | 'nip07' | 'bunker';

export class SessionState {
  session: PersistedSession | null = null;
  /** Invalidates async work when another login, restore or logout takes ownership. */
  readonly generation = new StateStore(0);
  readonly isRestoringSession = new StateStore(false);
  get sessionGeneration(): number { return this.generation.get(); }

  beginSessionOperation(): number {
    clearDecryptCache();
    this.isRestoringSession.set(false);
    this.isLoggedIn.set(false);
    const next = this.sessionGeneration + 1;
    this.generation.set(next);
    return next;
  }

  /** A retained capability belongs to this exact session, even on same-key relogin. */
  captureSessionGuard(): () => void {
    const session = this.session;
    const generation = this.sessionGeneration;
    return () => {
      this.assertSessionOperation(generation);
      if (this.session !== session) throw new DOMException('Session was replaced', 'AbortError');
    };
  }

  assertSessionOperation(generation: number): void {
    if (generation !== this.sessionGeneration) {
      throw new DOMException('Session operation was superseded', 'AbortError');
    }
  }

  /** The active relay list (always length 1 today): what group REQs and publishes target. */
  relays: string[] = [DEFAULT_RELAY];
  /**
   * Per-relay access state (NIP-42 / whitelist) for the active relay only.
   * Keyed by `normalizeRelayUrl(url)`. Updated from CLOSED reasons on the
   * session's watched REQs and from rejected publishes. Reset on a relay
   * switch and on every session reset.
   */
  readonly relayAccess = new StateStore<Record<string, RelayAccessState>>({});
  readonly connectionState = new StateStore<string>('Disconnected');
  readonly currentRelayUrl = new StateStore<string>(DEFAULT_RELAY);
  readonly configuredRelays = new StateStore<string[]>([...DEFAULT_RELAYS]);
  readonly isLoggedIn = new StateStore(false);
  /**
   * Reactive mirror of `session?.pubKeyHex`. Plain `getPublicKey()` is a
   * one-shot read; this store lets React components subscribe so they
   * re-render on login/logout without manual wiring.
   */
  readonly myPubkey = new StateStore<string | null>(null);
  /**
   * Reactive mirror of `session?.loginMethod`. Lets components derive
   * "do I need to wait for a remote signer?" without reaching into
   * the bridge's private session.
   */
  readonly myLoginMethod = new StateStore<LoginMethod | null>(null);
  /**
   * What the person should be told about keeping their session: it lives
   * for this visit only (`not-remembered`), or a reload could not restore it
   * (`./vault.ts`). Cleared when a login starts and on logout.
   */
  readonly sessionNotice = new StateStore<SessionNotice | null>(null);
}
