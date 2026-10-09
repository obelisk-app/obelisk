/**
 * NIP-04 (kind 4) DMs (round 4 plan, step 15, `dm/nip04.ts`): the session's
 * NIP-04 crypto dispatched by login method, the send for a thread the user
 * pinned to NIP-04, and the inbound ingest. Pure move from `client.ts`.
 */
import { CodedError } from '@/utils/errors/codes';
import { nip04, type Event as NostrEvent } from 'nostr-tools';
import { KIND_ENCRYPTED_DM } from '@/constants/nostr/nip-kinds';
import type { BridgeContext } from '../facade/context';
import { memoizeDecrypt } from '../cache/decrypt-cache';
import { getTag } from '../common/event-tags';
import { enqueueSignerOp, type SignerLane } from '../session/signer-queue';
import type { BunkerRunOpts, RemoteSigner } from '../session/bunker';
import type { DmSend, DmSettle } from './send';
import type { IngestDmParams } from './thread';

export type Nip04Context = Pick<BridgeContext, 'session' | 'signAndPublish'>;

export interface Nip04Deps {
  captureSessionGuard?(): () => void;
  withBunkerSigner<T>(operation: (signer: RemoteSigner) => Promise<T>, opts?: BunkerRunOpts): Promise<T>;
  /** The recipient's NIP-65 read relays (`dm/relays.ts`). */
  fetchRecipientReadRelays(pubkey: string): Promise<string[]>;
  /**
   * The decrypt the ingest uses. The facade's `decryptNip04`, so the
   * late-decrypt test (`bridge.test.ts`) can hold it open across an
   * account switch.
   */
  decrypt(senderPubkey: string, ciphertext: string, lane: SignerLane): Promise<string>;
  /** The session's connect generation; an ingest that outlived it is dropped. */
  generation(): number;
  ingestDM(params: IngestDmParams): void;
  /** Settle the optimistic placeholder (`dm/send.ts`). */
  settle: DmSettle;
  /** While DMs are locked, keep the event unopened for the unlock (`dm/store.ts`). True when held. */
  holdLocked(ev: NostrEvent): boolean;
  /** The encrypted store already holds this event's message. */
  isStored(wireId: string): boolean;
  /** Retain a failed decrypt for user-triggered retry, without polling the signer. */
  onDecryptFailure?(ev: NostrEvent): void;
  /** A message arrived while locked: alert with the sender, no text (`dm/thread.ts`). */
  alertLocked(ev: NostrEvent): void;
  /** Keep our own sent message in the encrypted store, so its echo is not decrypted again. */
  rememberOwn(params: IngestDmParams): void;
}

export class Nip04Module {
  constructor(
    private readonly ctx: Nip04Context,
    private readonly deps: Nip04Deps,
  ) {}

  /** Encrypt, sign and publish a kind 4, then settle the placeholder (`dm/send.ts`). */
  async publish({ recipientPubkey, content, clientTag, createdAt, file }: DmSend): Promise<void> {
    const assertCurrent = this.deps.captureSessionGuard?.() ?? (() => {});
    try {
      assertCurrent();
      if (file) throw new CodedError('files-need-nip17', 'NIP-04 cannot carry an encrypted file');
      const cipher = await this.encrypt(recipientPubkey, content);
      // NIP-04 DMs are delivered to the recipient's NIP-65 read relays; without
      // this, sends to anyone whose read set doesn't include the active relays will
      // never reach them. Failure to look up just falls back to the active relays.
      const extraRelays = await this.deps.fetchRecipientReadRelays(recipientPubkey).catch(() => [] as string[]);
      assertCurrent();
      const event = await this.ctx.signAndPublish(
        {
          kind: KIND_ENCRYPTED_DM,
          content: cipher,
          tags: [['p', recipientPubkey]],
          created_at: createdAt,
        },
        extraRelays,
        { assertCurrent },
      );
      assertCurrent();
      this.deps.settle.replacePending(
        recipientPubkey,
        clientTag,
        { id: event.id, createdAt: event.created_at, protocol: 'nip04', pq: false, raw: { wire: event } },
        content,
      );
      this.deps.rememberOwn({
        id: event.id,
        createdAt: event.created_at,
        plaintext: content,
        outgoing: true,
        counterparty: recipientPubkey,
        protocol: 'nip04',
        pq: false,
        notifyId: event.id,
        raw: { wire: event },
      });
    } catch {
      this.deps.settle.markFailed(recipientPubkey, clientTag);
    }
  }

  async ingestIncoming(ev: NostrEvent): Promise<void> {
    const session = this.ctx.session();
    if (!session) return;
    const me = session.pubKeyHex;
    const generation = this.deps.generation();
    const recipient = getTag(ev, 'p');
    const isOutgoing = ev.pubkey === me;
    if ((!isOutgoing && recipient !== me) || (isOutgoing && !recipient)) return;
    const counterparty = isOutgoing ? (recipient ?? '') : ev.pubkey;
    if (!counterparty) return;
    // Locked: not opened until the person asks for their DMs. The sender is
    // on the wire, so a new incoming one still raises a card, without text.
    if (this.deps.holdLocked(ev)) {
      if (!isOutgoing && !this.deps.isStored(ev.id)) this.deps.alertLocked(ev);
      return;
    }
    if (this.deps.isStored(ev.id)) return;
    let plaintext: string;
    try {
      // Background lane: nobody is waiting on an inbound DM the way they wait
      // on one they just sent. A backlog of these must not delay a signature.
      plaintext = await this.deps.decrypt(counterparty, ev.content, 'background');
    } catch {
      if (this.ctx.session()?.pubKeyHex === me && this.deps.generation() === generation) {
        this.deps.onDecryptFailure?.(ev);
      }
      return;
    }
    if (this.ctx.session()?.pubKeyHex !== me || this.deps.generation() !== generation) return;
    this.deps.ingestDM({
      id: ev.id,
      createdAt: ev.created_at,
      plaintext,
      outgoing: isOutgoing,
      counterparty,
      protocol: 'nip04',
      pq: false,
      notifyId: ev.id,
      raw: { wire: ev },
    });
  }

  async encrypt(
    recipientPubkey: string,
    content: string,
    lane: SignerLane = 'interactive',
  ): Promise<string> {
    const session = this.ctx.session();
    if (!session) throw new CodedError('not-logged-in', 'Not logged in');
    const assertCurrent = this.deps.captureSessionGuard?.() ?? (() => {});
    const guarded = async <T,>(operation: () => T | Promise<T>): Promise<T> => {
      assertCurrent();
      const result = await operation();
      assertCurrent();
      return result;
    };
    return guarded(async () => {
      if (session.loginMethod === 'nsec' && session.privKeyHex) {
        return nip04.encrypt(session.privKeyHex, recipientPubkey, content);
      }
      if (session.loginMethod === 'nip07') {
        const ext = window.nostr?.nip04;
        if (!ext?.encrypt) throw new CodedError('extension-no-nip04', 'Extension does not support NIP-04 encryption');
        return enqueueSignerOp(lane, 'nip04Encrypt', () => guarded(() => ext.encrypt(recipientPubkey, content)));
      }
      if (session.loginMethod === 'bunker') {
        return this.deps.withBunkerSigner(
          (b) => guarded(() => b.nip04Encrypt(recipientPubkey, content)),
          { lane, label: 'nip04Encrypt' },
        );
      }
      throw new CodedError('signer-unsupported', 'Cannot encrypt with current login method');
    });
  }

  async decrypt(
    senderPubkey: string,
    ciphertext: string,
    lane: SignerLane = 'interactive',
  ): Promise<string> {
    const session = this.ctx.session();
    if (!session) throw new CodedError('not-logged-in', 'Not logged in');
    const assertCurrent = this.deps.captureSessionGuard?.() ?? (() => {});
    const guarded = async <T,>(operation: () => T | Promise<T>): Promise<T> => {
      assertCurrent();
      const result = await operation();
      assertCurrent();
      return result;
    };
    return guarded(async () => {
      if (session.loginMethod === 'nsec' && session.privKeyHex) {
        return nip04.decrypt(session.privKeyHex, senderPubkey, ciphertext);
      }
      if (session.loginMethod === 'nip07') {
        const ext = window.nostr?.nip04;
        if (!ext?.decrypt) throw new CodedError('extension-no-nip04', 'Extension does not support NIP-04 decryption');
        return memoizeDecrypt('nip04', senderPubkey, ciphertext, () =>
          enqueueSignerOp(lane, 'nip04Decrypt', () => guarded(() => ext.decrypt(senderPubkey, ciphertext))),
        );
      }
      if (session.loginMethod === 'bunker') {
        return memoizeDecrypt('nip04', senderPubkey, ciphertext, () =>
          this.deps.withBunkerSigner(
            (b) => guarded(() => b.nip04Decrypt(senderPubkey, ciphertext)),
            { lane, label: 'nip04Decrypt' },
          ),
        );
      }
      throw new CodedError('signer-unsupported', 'Cannot decrypt with current login method');
    });
  }
}
