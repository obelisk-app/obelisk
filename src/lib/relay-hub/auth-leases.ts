/**
 * The hub's NIP-42 lease table: who has asked for permission to AUTH on a
 * `(relay, identity)` socket, refcounted per reason. A socket gets a signer
 * only while it holds at least one lease (`wantsSigner`). Pure bookkeeping:
 * the hub applies the side effects (installing `onauth`, dropping the AUTH
 * record, emitting status).
 */
import type { AuthLeaseReason, Identity } from './types';

interface LeaseRow {
  count: number;
  readonly reasons: Map<AuthLeaseReason, number>;
}

export class AuthLeases {
  private readonly rows = new Map<string, LeaseRow>();

  /** Take one lease on a socket key. */
  acquire(key: string, reason: AuthLeaseReason): void {
    let row = this.rows.get(key);
    if (!row) {
      row = { count: 0, reasons: new Map() };
      this.rows.set(key, row);
    }
    row.count += 1;
    row.reasons.set(reason, (row.reasons.get(reason) ?? 0) + 1);
  }

  /**
   * Give one lease back. Returns the socket's remaining count, or null when
   * the row was already gone (its identity was removed or the hub cleared).
   */
  release(key: string, reason: AuthLeaseReason): number | null {
    const row = this.rows.get(key);
    if (!row) return null;
    row.count = Math.max(0, row.count - 1);
    const r = row.reasons.get(reason) ?? 0;
    if (r <= 1) row.reasons.delete(reason);
    else row.reasons.set(reason, r - 1);
    if (row.count === 0) this.rows.delete(key);
    return row.count;
  }

  count(key: string): number {
    return this.rows.get(key)?.count ?? 0;
  }

  /** Forget every lease held for one identity (socket keys end in `|identityId`). */
  dropIdentity(identityId: string): void {
    for (const key of Array.from(this.rows.keys())) {
      if (key.endsWith('|' + identityId)) this.rows.delete(key);
    }
  }

  clear(): void {
    this.rows.clear();
  }
}

/**
 * Whether a socket may answer AUTH: only an `auth-when-challenged` identity
 * with a pubkey and a signer, and only while a lease names the socket. A
 * `never-auth` identity's socket never gets a signer, so it cannot answer a
 * challenge with any key, let alone the session's.
 */
export function wantsSigner(identity: Identity, leases: number): boolean {
  return identity.authPolicy === 'auth-when-challenged' && identity.signer !== null && identity.pubkey !== null && leases > 0;
}
