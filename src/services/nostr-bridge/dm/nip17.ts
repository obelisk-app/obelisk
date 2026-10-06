/**
 * The NIP-17 send (round 4 plan, step 15, `dm/nip17.ts`): one rumor, sealed
 * and gift-wrapped to the recipient's inbox, then sealed again for our own
 * inbox so the sent message survives a reload and reaches our other
 * devices. Post-quantum when the conversation qualifies. Pure move from
 * `client.ts`; the inbound half is `dm/inbox.ts`.
 */
import { getEventHash, type Event as NostrEvent, type UnsignedEvent } from 'nostr-tools';
import { KIND_DM_FILE_RUMOR } from '@/utils/nip-kinds';
import { KIND_GIFT_WRAP, buildChatMessage, sealAndGiftWrap } from '@nostr-wot/dm';
import type { NostrSigner as DmNostrSigner } from '@nostr-wot/signers';
import { resolvePqSend } from '@/services/pq/send';
import { buildDmFileTags } from '@/utils/attachments/dm-file';
import type { BridgeContext } from '../context';
import type { PublishSignedOpts } from '../publish';
import { pushRelayDebug } from '../relay-debug';
import { normalizeRelayUrl } from '../relay-url';
import type { DmSend, DmSettle } from './send';

export type Nip17Context = Pick<BridgeContext, 'session'>;

export interface Nip17Deps {
  dmSigner(): DmNostrSigner | null;
  /** The recipient's inbox ladder (`dm/relays.ts`). */
  resolveGiftWrapRelays(pubkey: string): Promise<{ relays: string[]; source: 'inbox' | 'nip65' | 'active-relay' }>;
  publishSignedEvent(ev: NostrEvent, relays: string[], opts: PublishSignedOpts): Promise<NostrEvent>;
  /** Our own inbox: the active relays plus the DM relays discovered for this session. */
  ownInbox(): string[];
  /** Settle the optimistic placeholder (`dm/send.ts`). */
  settle: DmSettle;
}

export class Nip17SendModule {
  constructor(
    private readonly ctx: Nip17Context,
    private readonly deps: Nip17Deps,
  ) {}

  /**
   * NIP-17: kind-14 rumor -> seal (kind 13) -> gift wrap (kind 1059), all
   * via @nostr-wot/dm. The signer adapter routes the seal's signature +
   * NIP-44 encryption through whichever login method is active; the wrap
   * itself is signed by a fresh ephemeral key inside `sealAndGiftWrap`, so
   * it never touches `signAndPublish`'s session-signing path. Any failure
   * before the recipient's copy is out marks the placeholder failed.
   */
  async publish({ recipientPubkey, content, clientTag, createdAt, file, extraTags }: DmSend): Promise<void> {
    try {
      const me = this.ctx.session()?.pubKeyHex;
      if (!me) throw new Error('Not logged in');
      const signer = this.deps.dmSigner();
      if (!signer) throw new Error('Not logged in');
      // ONE rumor, sealed twice, once for the recipient, once for us (see
      // `publishSelfCopy`). The rumor's id is what deduplicates the
      // two copies on ingest, so the second wrap must reuse this exact
      // object; a second `buildChatMessage` call would stamp a different
      // `created_at` and hash to a different id, and our own copy would come
      // back from the relay as a second message in the thread.
      //
      // The timestamp is pinned to the one the optimistic placeholder already
      // committed to, rather than `buildChatMessage`'s own `Date.now()`, so
      // the placeholder, the finalized local copy and the self-copy that
      // comes back off the relay all agree to the second.
      const chat = buildChatMessage(me, recipientPubkey, content);
      // A file message is the same rumor shape with kind 15 and the
      // decryption metadata appended to the chat message's `p` tag.
      const inner: UnsignedEvent = file
        ? {
          ...chat,
          kind: KIND_DM_FILE_RUMOR,
          tags: [...chat.tags, ...buildDmFileTags(file)],
          created_at: createdAt,
        }
        : { ...chat, tags: [...chat.tags, ...extraTags], created_at: createdAt };
      const rumorId = getEventHash(inner);
      // Post-quantum when the conversation qualifies, classic otherwise.
      // `resolvePqSend` never throws and returns null for every negative
      // case, so this cannot block a send.
      const pqPlan = await resolvePqSend({
        myPubkey: me,
        loginMethod: this.ctx.session()?.loginMethod ?? null,
        recipientPubkey,
      });
      let wrap: NostrEvent;
      let pq = false;
      if (pqPlan) {
        try {
          wrap = await sealAndGiftWrap(signer, recipientPubkey, inner, {
            pq: { scheme: 'pq', recipientKemKey: pqPlan.recipientKemKey },
          });
          pq = true;
        } catch {
          // The signer refused post-quantum after advertising it (a stale
          // `nip44.schemes` marker, a locked extension, a rejected prompt).
          // Never block a send: fall back to classic NIP-17 and record it
          // honestly as `pq: false`.
          wrap = await sealAndGiftWrap(signer, recipientPubkey, inner);
        }
      } else {
        wrap = await sealAndGiftWrap(signer, recipientPubkey, inner);
      }
      // Route to the recipient's NIP-17 inbox (kind 10050) and nowhere else
      // when they have one, see `DmRelaysModule.resolveGiftWrapRelays` for
      // the full ladder and why the old union with the active relays was the leak.
      const { relays: inboxRelays, source } = await this.deps.resolveGiftWrapRelays(recipientPubkey);
      pushRelayDebug({
        kind: 'dm-wrap-route',
        relays: inboxRelays,
        eventKind: KIND_GIFT_WRAP,
        status: source,
      });
      // `authMode: 'last-resort'`: never volunteer a NIP-42 AUTH as the real
      // sender on the socket carrying an ephemeral-keyed wrap. See
      // `PublishModule.publishSignedEvent`.
      await this.deps.publishSignedEvent(wrap, inboxRelays, { authMode: 'last-resort' });
      this.deps.settle.replacePending(
        recipientPubkey,
        clientTag,
        // The *rumor* id, not `wrap.id`. The gift wrap's id belongs to the
        // ephemeral-keyed envelope and differs between the recipient's copy
        // and ours, so keying the thread on it would let our own self-copy
        // render alongside this one. The rumor id is the same in both wraps
        // and on every other device, which is exactly what `ingestDM`'s
        // `existing.some(m => m.id === dm.id)` needs to dedupe.
        //
        // `createdAt` is our own pre-fuzz value, NOT `wrap.created_at`,
        // NIP-17 fuzzes both the seal's and the wrap's timestamps up to 2
        // days into the past for privacy, so the wrap's own timestamp would
        // make the just-sent message appear to have been sent days ago.
        { id: rumorId, createdAt, protocol: 'nip17', pq, file, tags: extraTags, raw: { rumor: { ...inner, id: rumorId }, wire: wrap } },
        content,
      );
      // Second wrap, addressed to us. Deliberately after the recipient's
      // copy has been published and the thread settled: this is history
      // durability, not delivery, and it must never gate the send.
      await this.publishSelfCopy(me, inner, pq ? pqPlan?.selfKemKey ?? null : null, inboxRelays);
    } catch {
      this.deps.settle.markFailed(recipientPubkey, clientTag);
    }
  }

  /**
   * Publish the sender-addressed second gift wrap NIP-17 expects.
   *
   * A kind-1059 is signed by a fresh ephemeral key, so there is no
   * `authors: [me]` filter that can ever find our own sends the way the
   * NIP-04 path does. Without this copy an outgoing NIP-17 message lives only
   * in the session that sent it: reload, or open Obelisk on another device,
   * and the sender's own history is gone while the recipient keeps it
   * permanently. The gift-wrap ingest already handles the shape this
   * produces (`outgoing === true`, real counterparty read off the rumor's
   * `p` tag).
   *
   * Three properties this has to preserve:
   *
   * - **Same rumor.** `inner` is the object the recipient's wrap sealed, so
   *   both copies carry the same rumor id and `ingestDM` dedupes ours against
   *   the local copy `replacePendingDM` already wrote.
   * - **Fresh ephemeral key.** `sealAndGiftWrap` generates one per call, so
   *   the two wraps share no key material. Reusing one would let any relay
   *   link the sender's copy to the recipient's and undo the metadata
   *   protection that is the whole point of NIP-17.
   * - **Never fails the send.** The recipient's copy is the message; losing
   *   ours degrades history only. Every failure here is swallowed and logged
   *   through the same relay-debug channel partial publish failures use.
   *
   * `selfKemKey` is our *own* ML-KEM encapsulation key, and is only ever
   * non-null when the recipient's copy actually went out post-quantum. Two
   * asymmetries drive that: sealing to ourselves with the peer's key would
   * produce an envelope only the peer could open, and sealing ours
   * post-quantum when the delivered copy was classic would make the message
   * read as protected after a reload when it never was.
   *
   * `recipientCopyRelays` is where the *other* wrap just went. Any relay that
   * received both wraps within a second of each other sees two equal-sized
   * kind-1059s and can pair them, which is exactly the linkage NIP-17 is
   * supposed to deny it, so those relays are subtracted from our own target
   * set. The subtraction is skipped if it would empty the set, because a
   * self-copy that lands nowhere is a lost outbox, and durability wins over a
   * marginal unlinkability gain on a relay that already saw the other wrap.
   */
  private async publishSelfCopy(
    me: string,
    inner: UnsignedEvent,
    selfKemKey: string | null,
    recipientCopyRelays: readonly string[] = [],
  ): Promise<void> {
    try {
      const signer = this.deps.dmSigner();
      if (!signer) return;
      let wrap: NostrEvent;
      if (selfKemKey) {
        try {
          wrap = await sealAndGiftWrap(signer, me, inner, {
            pq: { scheme: 'pq', recipientKemKey: selfKemKey },
          });
        } catch {
          // Same rule as the recipient's copy: never let a refused
          // post-quantum seal cost us the message. A classic seal addressed
          // to ourselves is ordinary NIP-44 self-ECDH and stays readable.
          wrap = await sealAndGiftWrap(signer, me, inner);
        }
      } else {
        wrap = await sealAndGiftWrap(signer, me, inner);
      }
      // Our own inbox, and only our own inbox: exactly the relays the
      // incoming-DM subscription has open REQs on for wraps addressed to us,
      // which is what makes this copy come back after a reload and reach our
      // other devices. The active relays are what `ensureInboxPublished`
      // advertises as our kind-10050, and the DM relays are the NIP-65/NIP-17
      // set discovered for this session, so no discovery round-trip is
      // needed here, and, more importantly, the recipient's relays are never
      // in this set. Publishing our self-copy to *their* infrastructure would
      // hand them a second wrap to correlate for no durability benefit.
      //
      // These relays already know us: we hold an authenticated read
      // subscription on each one (that is what the hub's 'dm' auth lease is),
      // so adding a publish tells them nothing about who we are that the
      // subscription did not.
      const ownInbox = this.deps.ownInbox();
      const excluded = new Set(recipientCopyRelays.map((r) => normalizeRelayUrl(r)));
      const disjoint = ownInbox.filter((r) => !excluded.has(normalizeRelayUrl(r)));
      const targets = disjoint.length > 0 ? disjoint : ownInbox;
      if (disjoint.length === 0 && excluded.size > 0) {
        // Both parties' only relay is the same one. Nothing to route around;
        // record it so the leak is visible in the relay-debug stream instead
        // of being silently absorbed.
        pushRelayDebug({
          kind: 'dm-self-copy-shares-relay',
          relays: targets,
          eventKind: KIND_GIFT_WRAP,
          reason: 'own inbox is a subset of the recipient copy targets',
        });
      }
      // `quiet`: the user already saw one "Publishing" entry for this
      // message, and a second one for a copy addressed to themselves reads
      // as the message being sent twice.
      await this.deps.publishSignedEvent(wrap, targets, { quiet: true, authMode: 'last-resort' });
    } catch (e) {
      pushRelayDebug({
        kind: 'dm-self-copy-failed',
        eventKind: KIND_GIFT_WRAP,
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
