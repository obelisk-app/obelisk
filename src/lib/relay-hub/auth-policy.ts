/**
 * The hub's NIP-42 policy: which socket may answer AUTH, and when. A lease
 * (`AuthLeases`) is a caller's permission to authenticate on one
 * `(relay, identity)` socket; `syncOnauth` is the one place `relay.onauth`
 * is set or cleared from the lease count, and `autoAuthFor` answers the
 * transport's question for a socket it is opening on its own.
 */
import type { AuthLease, AuthLeaseReason, Identity, Signer } from './types';
import type { AuthLayer } from './auth';
import type { SocketEntry, SocketTable } from './sockets';
import { AuthLeases, wantsSigner } from './auth-leases';
import { socketKey } from './canonical';

export interface AuthPolicyDeps {
  readonly sockets: SocketTable;
  readonly auth: AuthLayer;
  emitStatus(entry: SocketEntry): void;
  isDisposed(): boolean;
}

export class AuthPolicy {
  private readonly leases = new AuthLeases();

  constructor(private readonly deps: AuthPolicyDeps) {}

  acquire(url: string, reason: AuthLeaseReason, identity: Identity): AuthLease {
    const { sockets, auth } = this.deps;
    const key = socketKey(url, identity.id);
    this.leases.acquire(key, reason);
    const entry = sockets.get(url, identity.id);
    if (entry) {
      const hadSigner = entry.relay.onauth !== undefined;
      this.syncOnauth(entry);
      if (!hadSigner && entry.relay.onauth && entry.connection === 'connected') {
        // The relay may already have challenged this socket while no lease
        // existed; nostr-tools keeps the challenge, so answer it now instead
        // of waiting for the next REQ to be CLOSED `auth-required:`.
        entry.relay.auth(entry.relay.onauth).catch(() => undefined);
      }
      this.deps.emitStatus(entry);
    }
    let released = false;
    return {
      release: () => {
        if (released) return;
        released = true;
        const left = this.leases.release(key, reason);
        if (left === null) return;
        const e = sockets.get(url, identity.id);
        if (e) {
          this.syncOnauth(e);
          if (left === 0) auth.drop(e);
          this.deps.emitStatus(e);
        }
      },
    };
  }

  count(url: string, identityId: string): number {
    try {
      return this.leases.count(socketKey(url, identityId));
    } catch {
      return 0; // an unparseable URL holds no lease
    }
  }

  /** The one place `relay.onauth` is set; the rule is `wantsSigner`. */
  syncOnauth(entry: SocketEntry): void {
    const wants = wantsSigner(entry.identity, this.leases.count(entry.key));
    entry.relay.onauth = wants ? this.deps.auth.signerFor(entry) : undefined;
  }

  /**
   * The transport asks whether a socket it is opening to `url` may answer
   * AUTH. With a lease the socket is tracked (no handshake started: the
   * transport is doing that) so its signer exists before the first frame;
   * without one the answer is no signer, whichever path opened the socket.
   */
  autoAuthFor(url: string, identity: Identity): Signer | undefined {
    if (this.deps.isDisposed()) return undefined;
    const { sockets } = this.deps;
    let entry = sockets.get(url, identity.id);
    if (!entry) {
      if (this.count(url, identity.id) === 0) return undefined;
      try {
        entry = sockets.track(url, identity);
      } catch {
        return undefined; // budget or URL: the transport reports its own failure
      }
    }
    return entry.relay.onauth;
  }

  dropIdentity(identityId: string): void {
    this.leases.dropIdentity(identityId);
  }

  clear(): void {
    this.leases.clear();
  }
}
