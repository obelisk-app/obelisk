/**
 * DM call control messages (round 4 plan, step 15, `dm/calls.ts`): kind
 * 25055 rumors, sealed and gift-wrapped like a chat message but short-lived,
 * carried over the same inbox ladder, and handed to whoever listens (the DM
 * call store) instead of a thread. The call's media signaling is
 * `src/services/call/`, not this. Pure move from `client.ts`.
 */
import { CodedError } from '@/utils/errors/codes';
import { finalizeEvent, getEventHash, type Event as NostrEvent, type UnsignedEvent } from 'nostr-tools';
import { generateSecretKey } from 'nostr-tools/pure';
import { v2 as nip44 } from 'nostr-tools/nip44';
import { KIND_DM_CALL_RUMOR, KIND_SEAL } from '@/utils/nostr/nip-kinds';
import { KIND_GIFT_WRAP } from '@nostr-wot/dm';
import type { NostrSigner as DmNostrSigner } from '@nostr-wot/signers';
import { getPreferences } from '@/services/preferences/preferences';
import {
  encodeDmCallMessage,
  isFreshCallMessage,
  parseDmCallMessage,
  type DmCallMessage,
  type IncomingDmCallMessage,
} from '@/services/call/protocol';
import type { BridgeContext } from '../facade/context';
import type { PublishSignedOpts } from '../publish/publish';
import type { Unsubscribe } from '../common/types';

/** NIP-40 lifetime of a call-control gift wrap. */
const CALL_WRAP_TTL_S = 5 * 60;
/** Messages held while nobody listens, see {@link DmCallsModule.subscribe}. */
const HELD_MAX = 16;

type Incoming = IncomingDmCallMessage & { peer: string };

export type DmCallListener = (msg: IncomingDmCallMessage & { peer: string }) => void;

export type DmCallsContext = Pick<BridgeContext, 'session'>;

export interface DmCallsDeps {
  dmSigner(): DmNostrSigner | null;
  resolveGiftWrapRelays(pubkey: string): Promise<{ relays: string[] }>;
  publishSignedEvent(ev: NostrEvent, relays: string[], opts: PublishSignedOpts): Promise<NostrEvent>;
  /** Our own inbox: the active relays plus the DM relays discovered for this session. */
  ownInbox(): string[];
}

export class DmCallsModule {
  /** Listeners for DM call control messages, see {@link subscribe}. */
  private readonly listeners = new Set<DmCallListener>();
  /** Fresh messages that arrived while nobody listened, with the account they were for. */
  private held: Array<{ me: string; msg: Incoming }> = [];

  constructor(
    private readonly ctx: DmCallsContext,
    private readonly deps: DmCallsDeps,
  ) {}

  /**
   * Send a DM call control message (invite / accept / decline / cancel /
   * hangup / busy), sealed and gift-wrapped exactly like a chat message and
   * routed to the recipient's NIP-17 inbox by the same ladder.
   *
   * Two differences from a chat send, both because the message is only worth
   * anything for a minute:
   *
   * - The wrap carries a NIP-40 `expiration` a few minutes out, so an inbox
   *   relay drops it instead of keeping a record of every call forever. The
   *   cost is that a relay can tell a short-lived wrap from a message wrap,
   *   see docs/voice/dm-calls.md.
   * - No self-copy for history. The one exception is `selfNotice`: an accept
   *   or decline is also wrapped to ourselves so our *other* devices stop
   *   ringing ("answered elsewhere").
   */
  async send(
    recipientPubkey: string,
    msg: DmCallMessage,
    opts: { selfNotice?: boolean } = {},
  ): Promise<void> {
    const me = this.ctx.session()?.pubKeyHex;
    if (!me) throw new CodedError('not-logged-in', 'Not logged in');
    if (!getPreferences().directMessagesEnabled) throw new CodedError('dms-off', 'Direct messages are off');
    const signer = this.deps.dmSigner();
    if (!signer) throw new CodedError('not-logged-in', 'Not logged in');
    const now = Math.floor(Date.now() / 1000);
    const rumor: UnsignedEvent = {
      pubkey: me,
      kind: KIND_DM_CALL_RUMOR,
      created_at: now,
      tags: [['p', recipientPubkey]],
      content: encodeDmCallMessage(msg),
    };
    const expiresAt = now + CALL_WRAP_TTL_S;
    const wrap = await this.sealAndWrapExpiring(signer, recipientPubkey, rumor, expiresAt);
    const { relays } = await this.deps.resolveGiftWrapRelays(recipientPubkey);
    // Same rule as chat: never volunteer a NIP-42 identity on the socket
    // carrying an ephemeral-keyed wrap.
    await this.deps.publishSignedEvent(wrap, relays, { quiet: true, authMode: 'last-resort' });
    if (opts.selfNotice) {
      try {
        const selfWrap = await this.sealAndWrapExpiring(signer, me, rumor, expiresAt);
        const ownInbox = this.deps.ownInbox();
        await this.deps.publishSignedEvent(selfWrap, ownInbox, { quiet: true, authMode: 'last-resort' });
      } catch {
        // Other devices keep ringing until the caller's cancel or the timeout.
      }
    }
  }

  /**
   * `sealAndGiftWrap` with an `expiration` tag on the outer wrap, which the
   * SDK's version does not take. Same construction otherwise: rumor sealed by
   * us (kind 13, NIP-44 to the recipient, fuzzed timestamp), then wrapped by
   * a fresh ephemeral key per call.
   */
  private async sealAndWrapExpiring(
    signer: DmNostrSigner,
    recipientPubkey: string,
    rumor: UnsignedEvent,
    expiresAt: number,
  ): Promise<NostrEvent> {
    if (!signer.nip44Encrypt) throw new CodedError('signer-no-nip44', 'Signer does not support NIP-44');
    const fuzzed = () => Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 2 * 24 * 3600);
    const inner = { ...rumor, id: getEventHash(rumor) };
    const seal = await signer.signEvent({
      kind: KIND_SEAL,
      created_at: fuzzed(),
      tags: [],
      content: await signer.nip44Encrypt(recipientPubkey, JSON.stringify(inner)),
    });
    const ephSk = generateSecretKey();
    const conv = nip44.utils.getConversationKey(ephSk, recipientPubkey);
    return finalizeEvent(
      {
        kind: KIND_GIFT_WRAP,
        created_at: fuzzed(),
        tags: [['p', recipientPubkey], ['expiration', String(expiresAt)]],
        content: nip44.encrypt(JSON.stringify(seal), conv),
      },
      ephSk,
    );
  }

  /**
   * Call control messages never enter `dmsByPeer`; they go to whoever is
   * listening (the DM call store). Stale ones are dropped here, a
   * reconnect's backlog must not ring you for a call that ended an hour ago.
   *
   * `peer` is the other party: the sender for an inbound message, the rumor's
   * `p` tag for our own notice from another device.
   */
  /**
   * A message that arrives while nobody listens is held, not dropped, and
   * handed to the next listener (still fresh, still for the same account).
   * The DM inbox is often open before the call listener is: the read-state
   * root reads DMs as soon as the /app route runs, while the shell that
   * listens for calls is still downloading. Without this, an invite that
   * landed in that window was decrypted, marked seen, and never rang.
   */
  subscribe(cb: DmCallListener): Unsubscribe {
    this.listeners.add(cb);
    const held = this.held;
    this.held = [];
    if (held.length > 0) {
      queueMicrotask(() => {
        const me = this.ctx.session()?.pubKeyHex;
        for (const h of held) {
          if (!this.listeners.has(cb) || h.me !== me || !isFreshCallMessage(h.msg.sentAt)) continue;
          try { cb(h.msg); } catch (e) { console.warn('[dm-call] listener failed', e); }
        }
      });
    }
    return () => { this.listeners.delete(cb); };
  }

  ingest(message: UnsignedEvent & { id: string }, senderPubkey: string): void {
    if (!isFreshCallMessage(message.created_at)) return;
    const parsed = parseDmCallMessage(message.content);
    if (!parsed) return;
    const me = this.ctx.session()?.pubKeyHex;
    if (!me) return;
    const pTag = message.tags.find((t) => t[0] === 'p')?.[1];
    const peer = senderPubkey === me ? pTag : senderPubkey;
    if (!peer || peer === me) return;
    // An inbound message must be addressed to us, not merely delivered to us.
    if (senderPubkey !== me && pTag !== me) return;
    const incoming: Incoming = { ...parsed, from: senderPubkey, sentAt: message.created_at, peer };
    if (this.listeners.size === 0) {
      this.held.push({ me, msg: incoming });
      if (this.held.length > HELD_MAX) this.held.shift();
      return;
    }
    for (const cb of this.listeners) {
      try { cb(incoming); } catch (e) { console.warn('[dm-call] listener failed', e); }
    }
  }
}
