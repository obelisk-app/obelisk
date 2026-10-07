/**
 * The active relay's socket as the bridge sees it (round 4 plan, the
 * facade's connection half): the handshake `connect()` waits for, the
 * hub's status reports mirrored into the connection state and the login
 * gate, the `'active'` NIP-42 lease on the relay being browsed, and the
 * connect generation every async ingest checks. The hub owns the sockets,
 * their retry and their REQs; nothing here schedules a reconnect. Pure move
 * from `client.ts`.
 */
import { CodedError, codeOrMessage, type ActivityCode } from '@/utils/errors/codes';
import { SESSION_IDENTITY_ID, type AuthLease, type RelayHub, type RelayStatus } from '@/lib/relay-hub';
import { failActivity, pushActivity, resolveActivity } from '@/services/feedback/activity-log';
import { CONNECT_HANDSHAKE_TIMEOUT_MS } from '@/constants/nostr-bridge/facade';
import { pushRelayDebug } from '../relay/relay-debug';
import { validateRelayUrl } from '../relay/relay-list';
import { normalizeRelayUrl } from '@/utils/relay-url/normalize';
import type { RelayAccessState } from '../common/types';
import { isBrowserOffline } from './browser-events';
import type { PerGroupReqs } from './fanout';
import type { SessionState } from './state';

export interface ConnectionDeps {
  readonly hub: Pick<RelayHub, 'connect' | 'status' | 'acquireAuthLease'>;
  setRelayAccess(url: string, state: RelayAccessState): void;
  /** Forget every access verdict of the dead socket generation (`relay-access.ts`). */
  resetAccess(): void;
  /** The session's REQ fan-out (`./fanout.ts`). */
  openSessionSubscriptions(perGroup: PerGroupReqs | null): void;
}

export class ConnectionModule {
  /**
   * Active-relay URLs the bridge has seen up: the handshake `connect()`
   * waited for completed, or the hub reported the socket back after a drop.
   * A hub status leaving `connected` for one of them is a drop the bridge
   * reacts to; one for a URL not here (a relay being switched away from, a
   * socket the hub closed on identity change) is not. A `connected` report
   * for a URL not here is the socket coming up, as opposed to a lease or
   * AUTH transition on a socket that never went down.
   */
  private readonly sessionSocketUp = new Set<string>();
  /**
   * True while `dispose` runs. The teardown releases leases and hands
   * the hub the anonymous identity, and the hub reports each of those as a
   * status; none of them is a socket coming up or going down that the
   * bridge should react to.
   */
  tearingDown = false;
  /** NIP-42 permission on the relay being browsed, held while it is active. */
  private activeRelayLease: { url: string; lease: AuthLease } | null = null;
  /**
   * The relay-debug activity opened when a session socket dropped, resolved
   * when the hub brings it back. The hub owns the retry; this is the UI's
   * view of it.
   */
  private reconnectActivityId: number | null = null;
  /** Bumped by every connect, reset and teardown; an async result from an older generation is dropped. */
  generation = 0;

  constructor(
    private readonly state: SessionState,
    private readonly deps: ConnectionDeps,
  ) {}

  /** Forget which sockets were seen up (a session or relay reset; the next report re-proves them). */
  forgetSocketsUp(): void {
    this.sessionSocketUp.clear();
  }

  /** Release the `'active'` lease (teardown). */
  releaseActiveLease(): void {
    this.activeRelayLease?.lease.release();
    this.activeRelayLease = null;
  }

  /** Drop the "Reconnecting to relay" entry a teardown leaves behind. */
  dismissReconnectActivity(dismiss: (id: number) => void): void {
    if (this.reconnectActivityId !== null) {
      dismiss(this.reconnectActivityId);
      this.reconnectActivityId = null;
    }
  }

  /**
   * The hub reports every socket and AUTH transition here. The session's
   * REQs live in the hub's registry, which re-issues them on every new
   * socket generation by itself, so nothing here touches a REQ. Three
   * things the bridge still owns are driven from it:
   *
   *  - a drop of an active-relay socket the bridge had seen up: the
   *    connection state flips and the access verdicts captured against the
   *    dead generation are forgotten (the next REQ re-proves them). Nothing
   *    is scheduled: the hub's supervisor owns the retry and its backoff;
   *  - the socket coming up (`connected` for a URL not in
   *    `sessionSocketUp`): after a drop, or after an `initialize()`
   *    whose first handshake failed and left the hub holding the socket.
   *    The state flips to Connected and the login gate opens; the REQs are
   *    already on the wire, the hub issued them before this report. A
   *    `connected` for a URL already seen up is a lease or AUTH transition
   *    on a healthy socket and changes nothing;
   *  - the `'authenticating'` relay-access state (a challenge the hub is
   *    answering on the relay being browsed, so the UI gates cached data on
   *    a positive AUTH signal before the signer round-trip completes). Only
   *    entered from a state that carries no verdict: overwriting
   *    'restricted' / 'auth-required' would flip a rejection back to
   *    "Authenticating..." and cancel its pending soak.
   */
  onHubStatus(status: RelayStatus): void {
    if (status.identityId !== SESSION_IDENTITY_ID || this.tearingDown) return;
    const key = normalizeRelayUrl(status.url);
    const active = this.state.relays.some((r) => normalizeRelayUrl(r) === key);
    if (!active) {
      this.sessionSocketUp.delete(key);
      return;
    }
    if (status.connection === 'connected') {
      if (status.auth === 'challenged' || status.auth === 'signing') {
        const cur = this.state.relayAccess.get()[key];
        if (cur === undefined || cur === 'unknown' || cur === 'unreachable' || cur === 'error') {
          this.deps.setRelayAccess(status.url, 'authenticating');
        }
      }
      if (this.sessionSocketUp.has(key) || !this.state.session || isBrowserOffline()) return;
      this.onSessionSocketUp(status.url);
      return;
    }
    if (!this.sessionSocketUp.delete(key)) return;
    if (!this.state.session) return;
    this.state.connectionState.set(isBrowserOffline() ? "Offline" : "Disconnected"); // i18n-exempt: connection-state token the shells compare, not copy
    // The REQs stay in the registry and come back on the next generation;
    // the verdicts do not: they were this generation's answers, and the
    // re-issued REQs must re-prove access (and the next AUTH must not be
    // shown against a stale "Authenticating with {host}" entry).
    this.deps.resetAccess();
    this.deps.setRelayAccess(status.url, 'unreachable');
    if (this.reconnectActivityId === null) {
      this.reconnectActivityId = pushActivity('reconnect' satisfies ActivityCode, status.url, { operation: 'connect' });
    }
  }

  /**
   * An active-relay socket is up, by the hub's report or by a handshake
   * `connect()` waited for. Record it, report the connection and open the
   * login gate; a re-login or a reconnect reaches the same end state as a
   * first login. The REQs are not this method's business: the hub's
   * registry issued every pending one when the socket opened, before the
   * report that leads here.
   */
  private onSessionSocketUp(url: string): void {
    const session = this.state.session;
    if (!session) return;
    pushRelayDebug({ kind: 'handshake-ok', relay: url });
    this.sessionSocketUp.add(normalizeRelayUrl(url));
    this.state.connectionState.set('Connected');
    this.state.myPubkey.set(session.pubKeyHex);
    this.state.myLoginMethod.set(session.loginMethod);
    this.state.isLoggedIn.set(true);
    if (this.reconnectActivityId !== null) {
      resolveActivity(this.reconnectActivityId, url);
      this.reconnectActivityId = null;
    }
  }

  /** True once the bridge has seen an active-relay socket up and not yet seen it drop. */
  activeSocketUp(): boolean {
    return this.state.relays.some((url) => this.sessionSocketUp.has(normalizeRelayUrl(url)));
  }

  /** Hold NIP-42 permission on the relays being browsed, releasing the previous relay's. */
  syncActiveRelayLease(): void {
    const url = this.state.relays[0];
    const key = url ? normalizeRelayUrl(url) : null;
    if (this.activeRelayLease && this.activeRelayLease.url === key) return;
    this.activeRelayLease?.lease.release();
    this.activeRelayLease = key && url ? { url: key, lease: this.deps.hub.acquireAuthLease(url, 'active') } : null;
  }

  /**
   * Bring the active relay up and issue the session's REQs. `perGroup` is
   * what a session or relay reset released and wants back (see
   * `PerGroupReqs`); a first connect and a retry pass nothing.
   */
  async connect(perGroup: PerGroupReqs | null = null): Promise<void> {
    const state = this.state;
    if (isBrowserOffline()) {
      state.connectionState.set("Offline");
      throw new CodedError('offline', "browser offline");
    }
    const generation = ++this.generation;
    const relaySnapshot = [...state.relays];
    state.connectionState.set('Connecting');
    const activityId = pushActivity('connect' satisfies ActivityCode, relaySnapshot.join(', '), { operation: 'connect' });
    pushRelayDebug({ kind: 'connect-start', relays: relaySnapshot });
    try {
      // First-response wins: resolve as soon as ONE relay handshakes. Slower
      // relays keep handshaking in the background and their REQs are issued
      // as each socket comes up. If every relay rejects, this throws and
      // `initialize()` leaves the session to the hub's supervisor. The
      // handshake timeout leaves headroom for an Android PWA waking its radio
      // and opening a WebSocket through Cloudflare; 3s caused healthy relays
      // to be torn down and recreated in a reconnect loop after resume.
      //
      // The hub answers NIP-42 on the relay being browsed for as long as it
      // is the one being browsed; the lease is what lets its socket carry a
      // signer. Acquired before the handshake so no AUTH frame arrives
      // unanswered.
      this.syncActiveRelayLease();
      const handles = relaySnapshot.map((url) =>
        (async () => {
          validateRelayUrl(url);
          pushRelayDebug({ kind: 'handshake-start', relay: url });
          // The hub holds the socket from here on: it reconnects it with its
          // own backoff and reports every transition through `onHubStatus`,
          // where a later drop closes the REQs and the next `connected`
          // re-issues them. A handshake that fails here rejects at once
          // (fail-fast) while the supervisor keeps retrying behind it.
          await this.deps.hub.connect(url, { timeoutMs: CONNECT_HANDSHAKE_TIMEOUT_MS });
          if (generation !== this.generation) return url;
          pushRelayDebug({ kind: 'handshake-ok', relay: url });
          // The hub reported `connected` before resolving, so this is
          // already recorded unless the socket was up before the call.
          this.sessionSocketUp.add(normalizeRelayUrl(url));
          return url;
        })(),
      );
      // Mark each relay `unreachable` as its handshake fails, in the
      // background. Doesn't await, banner updates as we get news; the UI
      // proceeds only after the first successful handshake.
      handles.forEach((p, i) => {
        const url = relaySnapshot[i];
        p.catch((e) => {
          if (generation !== this.generation) return;
          pushRelayDebug({ kind: 'handshake-error', relay: url, reason: e instanceof Error ? e.message : String(e) });
          this.deps.setRelayAccess(url, 'unreachable');
        });
      });
      // The fan-out goes to the hub's registry now, not after the handshake:
      // a REQ on a socket that is not up yet sits pending and is issued, in
      // this order, the moment the socket opens (at once if it already is),
      // so nothing reaches the wire before the handshake and the login gate
      // still opens only after it. A handshake that fails leaves the REQs
      // pending for the supervisor's next attempt; there is no fan-out owed.
      this.deps.openSessionSubscriptions(perGroup);
      try {
        await Promise.any(handles);
      } catch {
        throw new CodedError('no-relays-connected', 'no relays connected');
      }
      state.connectionState.set('Connected');
      // The entry keeps the relays it set out for as its detail; slower
      // ones may still be handshaking when the gate flips.
      resolveActivity(activityId);
    } catch (e: unknown) {
      // The hub keeps every socket this call reached held and retries it;
      // its registry issues the pending REQs when one opens.
      // `Error:` then the code (the banner translates it) or the error's own words.
      state.connectionState.set(isBrowserOffline() ? "Offline" : "Error:" + codeOrMessage(e)); // i18n-exempt: connection-state token the shells compare, not copy
      failActivity(activityId, codeOrMessage(e));
      throw e;
    }
  }

  /**
   * The browser came back online or the tab became visible while the state
   * said we were down. The hub's socket table listens to the same events
   * and fires any retry it had scheduled, so there is nothing to schedule
   * here. Two cases remain the bridge's: the socket is in fact up and only
   * the state label was stale (reconcile it), or the hub holds nothing for
   * the active relay (an `initialize()` that failed before reaching the
   * hub), in which case ask it now. An explicit `connect()` in flight has
   * the hub `connecting`, so it is never doubled from here.
   */
  retryConnectionNow(): void {
    const state = this.state;
    if (!state.session) return;
    if (isBrowserOffline()) {
      state.connectionState.set("Offline");
      return;
    }
    const connected = state.relays.find((url) => this.deps.hub.status(url).connection === 'connected');
    if (connected) {
      if (this.sessionSocketUp.has(normalizeRelayUrl(connected))) state.connectionState.set('Connected');
      else this.onSessionSocketUp(connected);
      return;
    }
    const supervised = state.relays.some((url) => {
      const status = this.deps.hub.status(url).connection;
      return status === 'connecting' || status === 'reconnecting' || status === 'offline';
    });
    if (supervised) return; // the supervisor has it; `onHubStatus` reports its `connected`
    void this.connect().catch(() => undefined);
  }
}
