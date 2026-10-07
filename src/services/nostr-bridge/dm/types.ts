/**
 * The direct-message shapes the UI reads: one message in a thread and the
 * raw events behind it. Moved from `types.ts`, which re-exports both.
 */
import type { DMProtocol } from '@/store/chat/dm';
import type { JsDmFile } from '@/utils/attachments/dm-file';

/** A Nostr event as shown by "View raw event", signed (`sig`) or not. */
export interface DmRawEvent {
  readonly id: string;
  readonly pubkey: string;
  readonly created_at: number;
  readonly kind: number;
  readonly tags: ReadonlyArray<ReadonlyArray<string>>;
  readonly content: string;
  readonly sig?: string;
}

export interface JsDirectMessage {
  readonly id: string;
  /** The other party's pubkey (counterparty), regardless of direction. */
  readonly counterparty: string;
  /** True if the local user authored this message. */
  readonly outgoing: boolean;
  readonly content: string;
  readonly createdAt: number;
  /**
   * Which wire protocol carried this message. Every ingest path (NIP-04
   * decrypt, NIP-17 unwrap, and the optimistic-send placeholder) sets this
   * explicitly. Optional only so a message built before this field existed
   * reads as the historical default, plain NIP-04, rather than `undefined`
   * rendering as some third state.
   */
  readonly protocol?: DMProtocol;
  /**
   * Whether this specific message was sealed with `@nostr-wot/pq`'s hybrid
   * post-quantum envelope. Only meaningful when `protocol === 'nip17'`.
   * `undefined`/`false` both read as classic (non-post-quantum), including
   * for any message stored before this field existed.
   *
   * Set on both directions: inbound from `isPqEnvelope()` on the seal's
   * ciphertext (see `getDmSigner`'s `pqTrack`), outbound from whether
   * `resolvePqSend` produced a plan and the seal actually took it. Never
   * optimistic: a send that falls back to classic records `false`.
   */
  readonly pq?: boolean;
  /**
   * Set when this message is a NIP-17 kind-15 file message: `content` is then
   * the encrypted blob's URL, and this carries what the reader needs to
   * fetch, verify and decrypt it. Never set on NIP-04 messages.
   */
  readonly file?: JsDmFile;
  /**
   * The message as it exists on Nostr, for "View raw event". In memory only,
   * like every other DM field, never written to disk.
   *
   * - `rumor`: NIP-17 only, the decrypted inner event (kind 14 / 15), the
   *   actual message. Unsigned by design; its id is `id` above.
   * - `wire`: what a relay stores. The kind-1059 gift wrap for NIP-17 (for our
   *   own sends, the copy that went to the recipient), or the kind-4 event
   *   for NIP-04, whose `content` is still ciphertext.
   *
   * Absent on optimistic placeholders and on messages whose send failed.
   */
  readonly raw?: {
    readonly rumor?: DmRawEvent;
    readonly wire?: DmRawEvent;
  };
  /** NIP-30 custom emoji carried on the rumor (NIP-17 only). */
  readonly customEmojis?: Readonly<Record<string, string>>;
  /** Obelisk `["sticker", name, url]` extension, same as group chat (NIP-17 only). */
  readonly sticker?: { readonly name: string; readonly url: string; readonly packAddress?: string };
  /**
   * Optimistic-send fields, set only on outgoing placeholders the bridge
   * inserted for an in-flight or failed publish. See {@link JsMessage} for
   * the full contract; same semantics here.
   */
  readonly pending?: boolean;
  readonly failed?: boolean;
  readonly clientTag?: string;
}
