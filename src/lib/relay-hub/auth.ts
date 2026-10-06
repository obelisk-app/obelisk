/**
 * The NIP-42 AUTH layer: one record per `(relayUrl, pubkey)`, never per
 * challenge. The bug this replaces keyed the signature memo on
 * `JSON.stringify([pubkey, {kind, content, tags, created_at}])`, where
 * `tags` carries the per-socket challenge, so every reconnect and every
 * `created_at` rollover produced a fresh signer prompt.
 *
 * State machine, per record:
 *
 *   none ──(signer installed, socket up)──▶ not-required
 *   not-required / stale / failed ──(AUTH frame)──▶ challenged ──▶ signing
 *   signing ──(OK true)──▶ authenticated
 *   signing ──(OK false, e.g. `restricted:`)──▶ refused   (challenge pinned, never re-signed)
 *   signing ──(signer threw / auth timed out)──▶ failed    (memo cleared; next challenge retries)
 *   authenticated ──(socket drop)──▶ stale                 (record kept so the UI can say "re-authenticating")
 *   any ──(new challenge on the next generation)──▶ challenged
 *
 * The memo `signed` is scoped to `(socketGeneration, challenge)`: every
 * concurrent caller for that challenge gets the same promise, and a second
 * template for the same challenge with a later `created_at` is a memo hit.
 * A different challenge, or the same challenge string on a later socket
 * generation, is a new signature (NIP-42 binds the event to the socket).
 *
 * Three layers share one prompt: nostr-tools' per-socket `authPromise`
 * collapses concurrent `relay.auth()` calls; this memo covers the gap it
 * leaves (rollover, and a prompt still open when the socket is replaced);
 * the hub installs exactly one signer function per socket as `relay.onauth`.
 */
import type { EventTemplate, VerifiedEvent } from 'nostr-tools';
import type { AuthState, HubEnv, Identity, Signer } from './types';
import type { SocketEntry } from './sockets';
import { errorMessage } from './env';

export interface AuthRecord {
  readonly key: string;
  readonly url: string;
  readonly identityId: string;
  readonly pubkey: string;
  state: AuthState;
  socketGeneration: number;
  challenge: string | null;
  signed: Promise<VerifiedEvent> | null;
  /** Settles with the relay's verdict for the current challenge. */
  verdict: Promise<boolean> | null;
  authenticatedAt: number | null;
  refusedChallenge: string | null;
  promptCount: number;
  lastError: string | null;
}

/** The relay refused this challenge once already. `code` is the app's `auth-refused`. */
export class AuthRefusedError extends Error {
  readonly code = 'auth-refused';
  constructor(url: string) {
    super(`relay ${url} refused this challenge; not signing it again`); // i18n-exempt: developer message; readers get the code
    this.name = 'AuthRefusedError';
  }
}

export function challengeOf(template: EventTemplate): string | null {
  for (const tag of template.tags) {
    if (tag[0] === 'challenge' && typeof tag[1] === 'string') return tag[1];
  }
  return null;
}

export function authRecordKey(url: string, pubkey: string): string {
  return url + '|' + pubkey;
}

export class AuthLayer {
  private readonly records = new Map<string, AuthRecord>();
  private promptTotal = 0;

  constructor(
    private readonly env: HubEnv,
    private readonly onChange: (record: AuthRecord) => void,
  ) {}

  recordFor(entry: SocketEntry): AuthRecord | undefined {
    const pubkey = entry.identity.pubkey;
    if (!pubkey) return undefined;
    return this.records.get(authRecordKey(entry.url, pubkey));
  }

  stateFor(entry: SocketEntry): AuthState {
    const record = this.recordFor(entry);
    if (record) return record.state;
    return entry.relay.onauth ? 'not-required' : 'none';
  }

  promptCountFor(entry: SocketEntry): number {
    return this.recordFor(entry)?.promptCount ?? 0;
  }

  /**
   * Every prompt ever answered, as the hub's `promptCount()` promises. A
   * running total, not a sum over live records: a record goes with its
   * last lease (`drop`) or its identity, and a lease handoff on a healthy
   * socket (the browsed relay becoming a watched one) must not make a
   * prompt the user did see disappear from the count.
   */
  totalPrompts(): number {
    return this.promptTotal;
  }

  /**
   * The one signer installed as `relay.onauth` for this socket. The same
   * function answers nostr-tools' automatic AUTH, the hub's own
   * `relay.auth()` calls, and publish retries.
   */
  signerFor(entry: SocketEntry): Signer {
    return (template: EventTemplate) => this.sign(entry, template);
  }

  /** Socket dropped: an authenticated record goes stale; an in-flight memo is superseded. */
  onSocketDrop(entry: SocketEntry): void {
    const record = this.recordFor(entry);
    if (!record) return;
    if (record.state === 'authenticated' || record.state === 'signing' || record.state === 'challenged') {
      record.state = 'stale';
    }
    record.signed = null;
    record.verdict = null;
    this.onChange(record);
  }

  drop(entry: SocketEntry): void {
    const record = this.recordFor(entry);
    if (record) {
      this.records.delete(record.key);
      this.onChange({ ...record, state: 'none' });
    }
  }

  dropIdentity(identityId: string): void {
    for (const record of Array.from(this.records.values())) {
      if (record.identityId === identityId) this.records.delete(record.key);
    }
  }

  // ---- internals ------------------------------------------------------------

  private sign(entry: SocketEntry, template: EventTemplate): Promise<VerifiedEvent> {
    const identity = entry.identity;
    if (!identity.signer || !identity.pubkey || identity.authPolicy !== 'auth-when-challenged') {
      return Promise.reject(new Error(`identity ${identity.id} does not answer NIP-42 challenges`));
    }
    const challenge = challengeOf(template);
    if (challenge === null) return Promise.reject(new Error('AUTH template carries no challenge tag'));
    const record = this.ensureRecord(entry.url, identity, identity.pubkey);

    if (record.refusedChallenge === challenge && record.socketGeneration === entry.generation) {
      return Promise.reject(new AuthRefusedError(entry.url));
    }
    if (record.signed && record.challenge === challenge && record.socketGeneration === entry.generation) {
      return record.signed;
    }

    record.challenge = challenge;
    record.socketGeneration = entry.generation;
    record.lastError = null;
    record.state = 'challenged';
    this.onChange(record);
    record.state = 'signing';
    if (!identity.localSigner) {
      record.promptCount += 1;
      this.promptTotal += 1;
    }
    this.onChange(record);

    const signer = identity.signer;
    const signed = Promise.resolve().then(() => signer(template));
    record.signed = signed;
    signed.catch((err: unknown) => {
      if (record.signed !== signed) return;
      record.signed = null;
      record.state = 'failed';
      record.lastError = errorMessage(err);
      this.onChange(record);
    });
    // nostr-tools assigns `relay.authPromise` right after the executor that
    // called us returns, so by the next microtask `relay.auth()` hands back
    // that same promise, which settles with the relay's OK verdict.
    const verdict = new Promise<boolean>((resolve) => {
      queueMicrotask(() => {
        if (record.signed !== signed) {
          resolve(false);
          return;
        }
        entry.relay.auth(this.signerFor(entry)).then(
          () => {
            if (record.signed !== signed) {
              resolve(false);
              return;
            }
            record.state = 'authenticated';
            record.authenticatedAt = this.env.now();
            this.onChange(record);
            resolve(true);
          },
          (err: unknown) => {
            if (record.signed !== signed) {
              resolve(false);
              return;
            }
            const reason = errorMessage(err);
            record.lastError = reason;
            if (/timed out/i.test(reason) || record.state === 'failed') {
              record.state = 'failed';
              record.signed = null;
            } else {
              record.state = 'refused';
              record.refusedChallenge = challenge;
            }
            this.onChange(record);
            resolve(false);
          },
        );
      });
    });
    record.verdict = verdict;
    return signed;
  }

  private ensureRecord(url: string, identity: Identity, pubkey: string): AuthRecord {
    const key = authRecordKey(url, pubkey);
    let record = this.records.get(key);
    if (!record) {
      record = {
        key,
        url,
        identityId: identity.id,
        pubkey,
        state: 'none',
        socketGeneration: 0,
        challenge: null,
        signed: null,
        verdict: null,
        authenticatedAt: null,
        refusedChallenge: null,
        promptCount: 0,
        lastError: null,
      };
      this.records.set(key, record);
    }
    return record;
  }
}
