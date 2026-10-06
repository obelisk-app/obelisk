/**
 * The command half of the bridge facade: group messages, reactions, DMs,
 * group and profile edits, membership, lists, the media library, search,
 * export and publishing. Each method is a one-line delegation into the
 * module that owns the behaviour (`compose.ts` builds them). `BridgeImpl`
 * (`client.ts`) extends this with the lifecycle, the session, the
 * connection, the REQ entry points and the test probes; the read half is
 * `facade-reads.ts`.
 */
import type { Event as NostrEvent } from 'nostr-tools';
import type { JsDmFile } from '@/utils/attachments/dm-file';
import type { DmCallMessage } from '@/services/dm-call/protocol';
import type {
  JsMediaFavorites,
  JsMediaPack,
  JsSearchOptions,
  JsSearchResponse,
  LoadMoreMessagesResult,
} from './types';
import type { CreateGroupOptions, EditGroupMetadataOptions } from './groups/metadata';
import type { EditUserMetadataOptions } from './profiles';
import type { PublishOpts, PublishSignedOpts } from './publish';
import { BridgeReads } from './facade-reads';
import { searchMessages } from './search';
import { exportAccountData, type AccountExport } from './export';

export abstract class BridgeCommands extends BridgeReads {
  // -- Group operations --------------------------------------------------

  // -- Group messages: `groups/messages/`.
  sendMessage(
    groupId: string,
    content: string,
    replyTo?: { id: string; pubkey: string } | null,
    emojiTags: ReadonlyArray<ReadonlyArray<string>> = [],
  ): Promise<void> {
    return this.m.messages.sendMessage(groupId, content, replyTo, emojiTags);
  }
  removeMessage(groupId: string, eventId: string): Promise<void> {
    return this.m.messages.send.removeMessage(groupId, eventId);
  }
  retryMessage(groupId: string, clientTag: string): Promise<void> {
    return this.m.messages.send.retry(groupId, clientTag);
  }
  cancelPendingMessage(groupId: string, clientTag: string): void {
    this.m.messages.send.cancel(groupId, clientTag);
  }
  /** Page older history: 'added', 'end' (authoritative), or 'unavailable' (retryable). */
  loadMoreMessages(groupId: string): Promise<LoadMoreMessagesResult> {
    return this.m.messages.loadMore(groupId);
  }
  setActiveGroup(groupId: string | null): void {
    this.m.messages.queue.setActiveGroup(groupId);
  }
  /** Force-restart a channel's kind 9 REQ with a fresh retry budget (a "Reload"). */
  refreshGroupMessages(groupId: string): void {
    this.m.messages.stream.refresh(groupId);
  }
  /** @internal Test seam: empty-EOSE retries run for `groupId`, or null when none is tracked. */
  messagesRetryAttempts(groupId: string): number | null {
    return this.m.messages.retry.attempts(groupId);
  }

  sendReaction(
    targetEventId: string,
    targetPubkey: string,
    emoji: string,
    groupId: string,
    emojiTags: ReadonlyArray<ReadonlyArray<string>> = [],
  ): Promise<void> {
    return this.m.reactions.sendReaction(targetEventId, targetPubkey, emoji, groupId, emojiTags);
  }

  removeReaction(groupId: string, reactionEventId: string): Promise<void> {
    return this.m.reactions.removeReaction(groupId, reactionEventId);
  }

  // -- The encrypted DM store: `dm/store.ts`.
  /** Open the DMs: one signer call for the key, then the stored messages. Idempotent. */
  unlockDirectMessages(): Promise<void> {
    return this.m.dm.dmStore.unlock();
  }
  /** Settings is about to delete the store: stop writing and drop the key. */
  forgetDirectMessages(): Promise<void> {
    return this.m.dm.dmStore.forget();
  }
  /** The encrypted store holds this gift wrap's message: it is a DM, not read state. */
  isStoredDmWrap(wireId: string): boolean {
    return this.m.dm.dmStore.knows(wireId);
  }
  /** While DMs are on and locked, run `fn` once they are opened. True when deferred. */
  deferUntilDmsUnlocked(fn: () => void): boolean {
    return this.m.dm.dmStore.defer(fn);
  }

  sendDirectMessage(recipientPubkey: string, content: string, extraTags: string[][] = []): Promise<void> {
    return this.m.dm.dmSend.sendDirectMessage(recipientPubkey, content, extraTags);
  }

  sendDirectFile(recipientPubkey: string, file: JsDmFile): Promise<void> {
    return this.m.dm.dmSend.sendDirectFile(recipientPubkey, file);
  }

  sendDmCallMessage(
    recipientPubkey: string,
    msg: DmCallMessage,
    opts: { selfNotice?: boolean } = {},
  ): Promise<void> {
    return this.m.dm.dmCalls.send(recipientPubkey, msg, opts);
  }

  retryDirectMessage(counterparty: string, clientTag: string): Promise<void> {
    return this.m.dm.dmSend.retry(counterparty, clientTag);
  }

  cancelPendingDirectMessage(counterparty: string, clientTag: string): void {
    this.m.dm.dmSend.cancel(counterparty, clientTag);
  }

  createGroup(opts: CreateGroupOptions): Promise<string> {
    return this.m.metadata.createGroup(opts);
  }

  deleteGroupEvent(groupId: string, eventId: string): Promise<void> {
    return this.m.moderation.deleteGroupEvent(groupId, eventId);
  }

  editGroupMetadata(opts: EditGroupMetadataOptions): Promise<void> {
    return this.m.metadata.editGroupMetadata(opts);
  }

  editUserMetadata(opts: EditUserMetadataOptions, options: { create?: boolean } = {}): Promise<void> {
    return this.m.profiles.edit(opts, options);
  }

  /** See `GroupMetadataModule.fetchGroupMetadata`. */
  fetchGroupMetadata(groupId: string): Promise<boolean> {
    return this.m.metadata.fetchGroupMetadata(groupId);
  }

  // -- Membership: `groups/membership.ts`.
  joinGroup(groupId: string): Promise<void> {
    return this.m.membership.commands.joinGroup(groupId);
  }
  leaveGroup(groupId: string): Promise<void> {
    return this.m.membership.commands.leaveGroup(groupId);
  }
  putUser(groupId: string, pubkey: string, roles?: ReadonlyArray<string>, opts?: { quiet?: boolean }): Promise<void> {
    return this.m.membership.commands.putUser(groupId, pubkey, roles, opts);
  }
  removeUser(groupId: string, pubkey: string): Promise<void> {
    return this.m.membership.commands.removeUser(groupId, pubkey);
  }
  removePermission(groupId: string, pubkey: string, permissions: ReadonlyArray<string>): Promise<void> {
    return this.m.membership.commands.removePermission(groupId, pubkey, permissions);
  }
  claimCreatorAdmin(groupId: string): Promise<boolean> {
    return this.m.membership.claimCreatorAdmin(groupId);
  }
  getAdmins(groupId: string): readonly string[] {
    return this.m.membership.getAdmins(groupId);
  }
  getMembers(groupId: string): readonly string[] {
    return this.m.membership.getMembers(groupId);
  }

  // -- Lists, media library, search and export: `lists.ts`, `media-packs.ts`,
  //    `search.ts`, `export.ts`.
  setMuted(pubkey: string, muted: boolean): Promise<void> {
    return this.m.lists.setMuted(pubkey, muted);
  }
  saveMediaPack(pack: Pick<JsMediaPack, 'identifier' | 'title' | 'description' | 'image' | 'items'>): Promise<void> {
    return this.m.media.saveMediaPack(pack);
  }
  deleteMediaPack(address: string): Promise<void> {
    return this.m.media.deleteMediaPack(address);
  }
  saveMediaFavorites(favorites: Pick<JsMediaFavorites, 'items' | 'packAddresses'>): Promise<void> {
    return this.m.media.saveMediaFavorites(favorites);
  }
  searchMessages(opts: JsSearchOptions): Promise<JsSearchResponse> {
    return searchMessages(this.m.ctx, opts);
  }
  exportAccountData(): Promise<AccountExport> {
    return exportAccountData(this.m.ctx);
  }

  // -- Publishing. Bodies live in `publish.ts`; these stay so every caller
  //    in this file and every test keeps its call shape.
  async publishEvent(template: {
    kind: number;
    content: string;
    tags: string[][];
    created_at?: number;
  }, opts: PublishOpts = {}): Promise<NostrEvent> {
    return this.m.publisher.publishEvent(template, opts);
  }
  /**
   * Publish an already-signed event (a gift wrap signed by an ephemeral key,
   * say) with the relay-access tracking and retries; `opts.authMode` decides
   * who the relay learns we are (`PublishModule.publishSignedEvent`).
   * Anything already signed must come through here: `publishEvent` re-signs.
   */
  publishSignedEvent(event: NostrEvent, targetRelays: string[], opts?: PublishSignedOpts): Promise<NostrEvent> {
    return this.m.publisher.publishSignedEvent(event, targetRelays, opts);
  }
}
