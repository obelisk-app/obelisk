/**
 * Sending to a channel (round 4 plan, step 14): the optimistic placeholder,
 * the kind 9 publish with its NIP-27 `p` tags, the retry that replays the
 * exact same event, cancel, and the deletion of one's own message. Pure
 * move from `client.ts`.
 */
import type { MessagesContext, MessagesDeps } from './module';
import type { Event as NostrEvent } from 'nostr-tools';
import { KIND_EVENT_DELETION, KIND_GROUP_CHAT_MESSAGE } from '@/utils/nip-kinds';
import { customEmojiMapFromTags } from '@/utils/media-tags/custom-emoji-tags';
import { stickerFromTags } from '@/utils/media-tags/sticker-tags';
import { voiceNoteFromTags } from '@/utils/media-tags/voice-note-tags';
import { extractMentionPubkeysFromMessage } from '@/utils/message-text/mentions';
import { generateClientTag } from '../../hex';
import { updatePending } from '../../state-store';
import type { JsMessage } from '../../types';
import { type MessagesState } from './state';

export class MessageSend {
  constructor(
    private readonly s: MessagesState,
    private readonly ctx: MessagesContext,
    private readonly deps: MessagesDeps,
  ) {}

  async sendMessage(
    groupId: string,
    content: string,
    replyTo?: { id: string; pubkey: string } | null,
    emojiTags: ReadonlyArray<ReadonlyArray<string>> = [],
  ): Promise<void> {
    const session = this.ctx.session();
    if (!session) throw new Error('Not logged in');
    const clientTag = generateClientTag();
    const createdAt = Math.floor(Date.now() / 1000);
    const replyToCopy = replyTo ? { id: replyTo.id, pubkey: replyTo.pubkey } : null;
    const emojiTagsCopy = emojiTags.map((tag) => [...tag]);
    const pendingMsg: JsMessage = {
      id: `pending:${clientTag}`,
      pubkey: session.pubKeyHex,
      content,
      createdAt,
      kind: KIND_GROUP_CHAT_MESSAGE,
      replyToId: replyToCopy?.id ?? null,
      mentions: [],
      customEmojis: customEmojiMapFromTags(emojiTagsCopy),
      sticker: stickerFromTags(content, emojiTagsCopy) ?? undefined,
      voiceNote: voiceNoteFromTags(content, emojiTagsCopy) ?? undefined,
      pending: true,
      clientTag,
    };
    this.s.pendingSends.set(clientTag, { groupId, content, replyTo: replyToCopy, emojiTags: emojiTagsCopy, createdAt });
    this.deps.pings.recordRelayUse(this.ctx.currentRelayUrl.get());
    this.upsertPending(groupId, pendingMsg);
    void this.publish(groupId, content, replyToCopy, emojiTagsCopy, clientTag, createdAt);
  }

  async removeMessage(groupId: string, eventId: string): Promise<void> {
    const event = await this.ctx.signAndPublish({
      kind: KIND_EVENT_DELETION,
      content: 'remove message',
      tags: [
        ['e', eventId],
        ['k', String(KIND_GROUP_CHAT_MESSAGE)],
        ['h', groupId],
      ],
      created_at: Math.floor(Date.now() / 1000),
    });
    this.deps.moderation.ingestEventDeletion(groupId, event);
  }

  async publish(
    groupId: string,
    content: string,
    replyTo: { id: string; pubkey: string } | null,
    emojiTags: string[][],
    clientTag: string,
    createdAt: number,
  ): Promise<void> {
    const tags: string[][] = [...emojiTags, ['h', groupId]];
    if (replyTo) {
      tags.push(['e', replyTo.id, '', 'reply']);
      tags.push(['p', replyTo.pubkey]);
    }
    // NIP-27: p-tag every `nostr:npub` mentioned in the content, so a
    // recipient can find the ping with a cheap `#p` filter, that is what
    // the background relay watcher listens on.
    for (const pk of extractMentionPubkeysFromMessage(content, [])) {
      if (!tags.some((t) => t[0] === 'p' && t[1] === pk)) tags.push(['p', pk]);
    }
    try {
      const event = await this.ctx.signAndPublish({
        kind: KIND_GROUP_CHAT_MESSAGE,
        content,
        tags,
        created_at: createdAt,
      });
      this.replacePending(groupId, clientTag, event);
    } catch {
      this.markFailed(groupId, clientTag);
    }
  }

  async retry(groupId: string, clientTag: string): Promise<void> {
    const args = this.s.pendingSends.get(clientTag);
    if (!args) return;
    // Only retry from a failed state, prevents double-publishing if the
    // user double-taps Retry while a previous attempt is still in flight.
    const list = this.s.messagesByGroup.get()[groupId] ?? [];
    const msg = list.find((m) => m.clientTag === clientTag);
    if (!msg || !msg.failed) return;
    this.flipToPending(groupId, clientTag);
    void this.publish(args.groupId, args.content, args.replyTo, args.emojiTags, clientTag, args.createdAt);
  }

  cancel(groupId: string, clientTag: string): void {
    this.s.pendingSends.delete(clientTag);
    updatePending(this.s.messagesByGroup, groupId, clientTag, null);
  }

  upsertPending(groupId: string, msg: JsMessage): void {
    this.s.messagesByGroup.update((prev) => {
      const existing = prev[groupId] ?? [];
      const next = [...existing, msg].sort((a, b) => a.createdAt - b.createdAt);
      return { ...prev, [groupId]: next };
    });
  }

  replacePending(groupId: string, clientTag: string, ev: NostrEvent): void {
    // Once the relay returns the real event, drop the args, a retry from
    // here would re-publish a finalized message.
    this.s.pendingSends.delete(clientTag);
    const replyTo = ev.tags.find((t) => t[0] === 'e' && t[3] === 'reply')?.[1] ?? null;
    const mentions = extractMentionPubkeysFromMessage(ev.content, ev.tags);
    const realMsg: JsMessage = {
      id: ev.id,
      pubkey: ev.pubkey,
      content: ev.content,
      createdAt: ev.created_at,
      kind: ev.kind,
      replyToId: replyTo,
      mentions,
      customEmojis: customEmojiMapFromTags(ev.tags),
      sticker: stickerFromTags(ev.content, ev.tags) ?? undefined,
      voiceNote: voiceNoteFromTags(ev.content, ev.tags) ?? undefined,
    };
    this.s.messagesByGroup.update((prev) => {
      const existing = prev[groupId] ?? [];
      const realPresent = existing.some((m) => m.id === realMsg.id);
      // The relay echo may have raced through ingestMessage first, in that
      // case the placeholder is already gone (ingestMessage replaces it by
      // tuple match) so this update is a no-op.
      if (realPresent) {
        const filtered = existing.filter((m) => m.clientTag !== clientTag);
        if (filtered.length === existing.length) return prev;
        return { ...prev, [groupId]: filtered };
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
        // Placeholder was canceled before the publish ack landed, append
        // the real event so the user sees the message they sent.
        return { ...prev, [groupId]: [...existing, realMsg].sort((a, b) => a.createdAt - b.createdAt) };
      }
      swapped.sort((a, b) => a.createdAt - b.createdAt);
      return { ...prev, [groupId]: swapped };
    });
    this.deps.ensureUserMetadata(ev.pubkey);
  }

  markFailed(groupId: string, clientTag: string): void {
    updatePending(this.s.messagesByGroup, groupId, clientTag, { pending: false, failed: true });
  }

  flipToPending(groupId: string, clientTag: string): void {
    updatePending(this.s.messagesByGroup, groupId, clientTag, { pending: true, failed: false });
  }
}
