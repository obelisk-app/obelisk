/**
 * The DM send path's front half (round 4 plan, step 15, `dm/send.ts`): the
 * optimistic placeholder, the per-thread protocol choice, the retry and
 * cancel commands, and the four helpers that patch a placeholder in the
 * thread store. The wire work is the protocol modules' (`dm/nip04.ts`,
 * `dm/nip17.ts`); this module only picks one and settles the placeholder.
 * Pure move from `client.ts`.
 */
import { CodedError } from '@/utils/errors/codes';
import { useDMStore, type DMProtocol } from '@/store/chat/dm';
import type { JsDmFile } from '@/utils/attachments/dm-file';
import type { BridgeContext } from '../facade/context';
import { dmTagExtras } from '../common/event-tags';
import { generateClientTag } from '../common/hex';
import { updatePending } from '../common/state-store';
import type { JsDirectMessage } from '../common/types';

export type DmSendContext = Pick<BridgeContext, 'session' | 'dmsByPeer'>;

/** What `replacePending` writes over the placeholder once the wire event exists. */
export interface SettledDm {
  id: string;
  createdAt: number;
  protocol: DMProtocol;
  pq: boolean;
  file?: JsDmFile;
  tags?: string[][];
  raw?: JsDirectMessage['raw'];
}

/** One DM send, as the protocol modules (`dm/nip04.ts`, `dm/nip17.ts`) take it. */
export interface DmSend {
  recipientPubkey: string;
  content: string;
  clientTag: string;
  createdAt: number;
  file?: JsDmFile;
  extraTags: string[][];
}

/**
 * How a protocol module settles the placeholder it was handed: replaced by
 * the real message, or marked failed for a manual retry.
 */
export interface DmSettle {
  replacePending(counterparty: string, clientTag: string, params: SettledDm, plaintext: string): void;
  markFailed(counterparty: string, clientTag: string): void;
}

export interface DmSendDeps {
  /**
   * The wire half of a send (`dm/nip04.ts`, `dm/nip17.ts`). Each owns the
   * whole attempt, settling the placeholder through {@link DmSettle}, so the
   * send runs in exactly the microtask steps it did as one facade method.
   */
  publishNip04(send: DmSend): Promise<void>;
  publishNip17(send: DmSend): Promise<void>;
  ensureUserMetadata(pubkey: string): void;
}

/**
 * Which DM wire protocol to use for `recipientPubkey`: the per-thread
 * override from `useDMStore` (`src/store/chat/dm.ts`) if the user has picked
 * one, otherwise NIP-17 by default. NIP-04 is opt-in-per-thread now, not
 * the default, see `docs/features/direct-messages.md`.
 */
export function resolveDmProtocol(recipientPubkey: string): DMProtocol {
  const override = useDMStore.getState().protocolOverrides[recipientPubkey];
  return override === 'nip04' ? 'nip04' : 'nip17';
}

export class DmSendModule {
  /** Same as the group sends' `pendingGroupSends`, for DMs. */
  private readonly pendingSends = new Map<string, {
    recipientPubkey: string;
    content: string;
    createdAt: number;
    protocol: DMProtocol;
    file?: JsDmFile;
    tags?: string[][];
  }>();

  constructor(
    private readonly ctx: DmSendContext,
    private readonly deps: DmSendDeps,
  ) {}

  /** Forget every in-flight send (account switch, logout). */
  clearPending(): void {
    this.pendingSends.clear();
  }

  /** The relay echo replaced a placeholder: a retry from here would re-publish a finalized message. */
  forgetPending(clientTag: string): void {
    this.pendingSends.delete(clientTag);
  }

  /**
   * `extraTags` carries the same NIP-30 `emoji` / Obelisk `sticker` tags a
   * group message does. They ride inside the rumor, so on NIP-17 they are as
   * private as the text. A NIP-04 thread drops them: a kind 4's tags are in
   * the clear, and a sticker tag would publish what was said.
   */
  async sendDirectMessage(recipientPubkey: string, content: string, extraTags: string[][] = []): Promise<void> {
    this.startDirectSend(recipientPubkey, content, undefined, extraTags);
  }

  /**
   * Send an already-encrypted, already-uploaded file as a NIP-17 kind-15
   * rumor. The caller (`src/services/chat/dm/dm-attachments.ts`) does the AES-GCM
   * encryption and the anonymous Blossom upload; this only seals the
   * metadata, URL, key, nonce, hashes, into a gift wrap.
   *
   * NIP-04 has no file message, and quietly sending the key in a kind-4
   * would put it on a wire format with a visible sender and recipient, so a
   * thread the user pinned to NIP-04 refuses outright.
   */
  async sendDirectFile(recipientPubkey: string, file: JsDmFile): Promise<void> {
    if (resolveDmProtocol(recipientPubkey) !== 'nip17') {
      throw new CodedError('files-need-nip17', 'Encrypted files need NIP-17 for this conversation');
    }
    this.startDirectSend(recipientPubkey, file.url, file);
  }

  private startDirectSend(recipientPubkey: string, content: string, file?: JsDmFile, extraTags: string[][] = []): void {
    const session = this.ctx.session();
    if (!session) throw new CodedError('not-logged-in', 'Not logged in');
    const clientTag = generateClientTag();
    const createdAt = Math.floor(Date.now() / 1000);
    // Per-thread override (`useDMStore.protocolOverrides`) if the user
    // picked one, otherwise NIP-17. See `resolveDmProtocol`.
    const protocol = resolveDmProtocol(recipientPubkey);
    const tags = protocol === 'nip17' ? extraTags : [];
    const pendingMsg: JsDirectMessage = {
      id: `pending:${clientTag}`,
      counterparty: recipientPubkey,
      outgoing: true,
      content,
      file,
      ...dmTagExtras(content, tags),
      createdAt,
      pending: true,
      clientTag,
      protocol,
      // Whether this send ends up post-quantum isn't known yet: resolving it
      // needs the peer's kind:10203 attestation off a relay (see
      // `resolvePqSend`). `false` is the honest placeholder, never claim
      // protection we haven't established, and `replacePendingDM` writes
      // the real value once the seal is built. The UI suppresses provenance
      // marks on in-flight messages so this never flickers a wrong claim.
      pq: false,
    };
    this.pendingSends.set(clientTag, { recipientPubkey, content, createdAt, protocol, file, tags });
    this.upsertPending(recipientPubkey, pendingMsg);
    this.publish(recipientPubkey, content, clientTag, createdAt, protocol, file, tags);
  }

  private publish(
    recipientPubkey: string,
    content: string,
    clientTag: string,
    createdAt: number,
    protocol: DMProtocol,
    file?: JsDmFile,
    extraTags: string[][] = [],
  ): void {
    const send: DmSend = { recipientPubkey, content, clientTag, createdAt, file, extraTags };
    void (protocol === 'nip04' ? this.deps.publishNip04(send) : this.deps.publishNip17(send));
  }

  async retry(counterparty: string, clientTag: string): Promise<void> {
    const args = this.pendingSends.get(clientTag);
    if (!args) return;
    const list = this.ctx.dmsByPeer.get()[counterparty] ?? [];
    const msg = list.find((m) => m.clientTag === clientTag);
    if (!msg || !msg.failed) return;
    this.flipToPending(counterparty, clientTag);
    this.publish(args.recipientPubkey, args.content, clientTag, args.createdAt, args.protocol, args.file, args.tags);
  }

  cancel(counterparty: string, clientTag: string): void {
    this.pendingSends.delete(clientTag);
    updatePending(this.ctx.dmsByPeer, counterparty, clientTag, null);
  }

  private upsertPending(counterparty: string, msg: JsDirectMessage): void {
    this.ctx.dmsByPeer.update((prev) => {
      const existing = prev[counterparty] ?? [];
      const next = [...existing, msg].sort((a, b) => a.createdAt - b.createdAt);
      return { ...prev, [counterparty]: next };
    });
  }

  replacePending(
    counterparty: string,
    clientTag: string,
    // `id`/`createdAt` are passed explicitly rather than derived from the
    // published event: for NIP-17 the gift-wrap's own `id`/`created_at`
    // belong to the ephemeral-keyed wrap, and the wrap's timestamp is
    // fuzzed up to 2 days into the past for privacy, neither is what the
    // sender's own thread should display.
    params: SettledDm,
    plaintext: string,
  ): void {
    this.pendingSends.delete(clientTag);
    const realMsg: JsDirectMessage = {
      id: params.id,
      counterparty,
      outgoing: true,
      content: plaintext,
      ...(params.file ? { file: params.file } : {}),
      ...dmTagExtras(plaintext, params.tags ?? []),
      ...(params.raw ? { raw: params.raw } : {}),
      createdAt: params.createdAt,
      protocol: params.protocol,
      pq: params.pq,
    };
    this.ctx.dmsByPeer.update((prev) => {
      const existing = prev[counterparty] ?? [];
      const realPresent = existing.some((m) => m.id === realMsg.id);
      if (realPresent) {
        const filtered = existing.filter((m) => m.clientTag !== clientTag);
        if (filtered.length === existing.length) return prev;
        return { ...prev, [counterparty]: filtered };
      }
      let replaced = false;
      const swapped = existing.map((m) => {
        if (m.clientTag === clientTag) {
          replaced = true;
          return realMsg;
        }
        return m;
      });
      if (!replaced) {
        return { ...prev, [counterparty]: [...existing, realMsg].sort((a, b) => a.createdAt - b.createdAt) };
      }
      swapped.sort((a, b) => a.createdAt - b.createdAt);
      return { ...prev, [counterparty]: swapped };
    });
    this.deps.ensureUserMetadata(counterparty);
  }

  markFailed(counterparty: string, clientTag: string): void {
    updatePending(this.ctx.dmsByPeer, counterparty, clientTag, { pending: false, failed: true });
  }

  private flipToPending(counterparty: string, clientTag: string): void {
    updatePending(this.ctx.dmsByPeer, counterparty, clientTag, { pending: true, failed: false });
  }
}
