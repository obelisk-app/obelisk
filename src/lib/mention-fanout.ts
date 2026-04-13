/**
 * Shared mention fan-out pipeline.
 *
 * Invoked from anywhere a user-authored message is persisted (Socket.io
 * `send-message` handler, forum post creation REST, forum reply REST). Keeps
 * mention semantics identical across entry points so that the sidebar,
 * notification store, and Mention DB rows stay in sync.
 *
 * Mention delivery is **unconditional** — it does not consult
 * `PostSubscription` or any opt-in signal. Per-user muting is a roadmap
 * feature, not a default gate. The only filter applied is read-permission:
 * a user who cannot read the channel must not be notified about it.
 */
import type { PrismaClient } from '@/generated/prisma/client';
import { extractMentionPubkeys, hasEveryoneMention } from '@/lib/mentions';
import { canReadChannel, hasRole } from '@/lib/roles';
import { resolveMemberAccess } from '@/lib/channel-access';

export interface MentionFanoutInput {
  prisma: PrismaClient;
  io: any; // Socket.io Server (typed as any to avoid coupling to socket.io types in lib)
  /** Message or post ID that was just persisted. */
  messageId: string;
  channelId: string;
  serverId: string;
  /** Author of the new message. Not notified about their own mention. */
  authorPubkey: string;
  /** Raw content to scan for mentions. */
  content: string;
  /** Optional post ID (forum post this message belongs to or is). Enables
   *  thread-level mention flagging client-side. */
  postId?: string;
  /** Metadata about the forum post. When provided alongside `postId`, the
   *  mentioned users are auto-subscribed to the post and receive a
   *  `post-subscribed` socket event carrying this meta so the thread shows
   *  up in their followed-posts sidebar immediately. */
  postMeta?: {
    title: string;
    channelName: string;
  };
  /** If this is a reply, the author of the message being replied to — treated
   *  as an implicit mention (Discord-style). */
  replyToAuthorPubkey?: string | null;
  /** Channel read-permission object used to gate `@everyone` fan-out so
   *  hidden channels don't leak via mention badges. */
  channel: {
    readPermission: string | null;
    readRoleIds?: string[];
  };
  /** ISO timestamp for the notification event. */
  createdAt: Date | string;
}

export interface MentionFanoutResult {
  mentionedPubkeys: string[];
  everyoneBroadcast: boolean;
}

/**
 * Run the mention pipeline: create Mention rows, emit `notification` +
 * `unread-update` + (when `postId` is present) `post-unread` with
 * `hasMention: true` to each mentioned pubkey's sockets.
 *
 * The parent channel's `unread-update` fan-out is NOT the responsibility of
 * this helper — callers already own that path (server.ts `send-message`
 * broadcasts to all out-of-room members; REST routes pair this with their
 * own `unread-update` emit). This helper only guarantees mention-specific
 * delivery so mentions never get dropped.
 */
export async function fanOutMentions(input: MentionFanoutInput): Promise<MentionFanoutResult> {
  const {
    prisma, io, messageId, channelId, serverId, authorPubkey, content,
    postId, postMeta, replyToAuthorPubkey, channel, createdAt,
  } = input;

  const directMentions = extractMentionPubkeys(content);
  const mentionedSet = new Set<string>(directMentions);

  if (replyToAuthorPubkey && replyToAuthorPubkey !== authorPubkey) {
    mentionedSet.add(replyToAuthorPubkey);
  }

  // @everyone: only mods+ fan out; read-permission applied per-member.
  let everyoneBroadcast = false;
  if (hasEveryoneMention(content)) {
    const authorAccess = await resolveMemberAccess(authorPubkey, serverId);
    if (hasRole(authorAccess.role, 'mod')) {
      everyoneBroadcast = true;
      const members = await prisma.member.findMany({
        where: { serverId },
        select: { pubkey: true },
      });
      for (const m of members) {
        if (m.pubkey === authorPubkey) continue;
        if (channel.readPermission) {
          const access = await resolveMemberAccess(m.pubkey, serverId);
          if (!canReadChannel(access.role, channel as any, access.customRoleIds)) continue;
        }
        mentionedSet.add(m.pubkey);
      }
    }
  }

  // Drop self-mention — authors don't notify themselves.
  mentionedSet.delete(authorPubkey);

  if (mentionedSet.size === 0) {
    return { mentionedPubkeys: [...directMentions], everyoneBroadcast };
  }

  // Persist Mention rows (idempotent on replay).
  await prisma.mention.createMany({
    data: [...mentionedSet].map((pubkey) => ({
      messageId,
      pubkey,
      channelId,
    })),
    skipDuplicates: true,
  });

  // Auto-subscribe mentioned users to the forum post so the thread shows up
  // in their followed-posts list — without this the `@` badge on the forum
  // channel leads to a forum index with no visible pointer to the thread.
  // Users can unfollow explicitly; `suppressedAutoFollowPostIds` on the
  // client only prevents auto-follow-on-send, not auto-follow-on-mention
  // (a mention is a stronger signal of interest from the author's side).
  if (postId) {
    try {
      await prisma.postSubscription.createMany({
        data: [...mentionedSet].map((pubkey) => ({ postId, pubkey })),
        skipDuplicates: true,
      });
    } catch (err) {
      console.error('[fanOutMentions] post auto-subscribe failed', err);
    }
  }

  const preview = content.slice(0, 100);
  const createdAtIso = typeof createdAt === 'string' ? createdAt : createdAt.toISOString();
  const directSet = new Set(directMentions);

  for (const pubkey of mentionedSet) {
    // Per-member read-permission gate already applied above for @everyone.
    // Direct mentions bypass read-permission: if a user is explicitly named,
    // they get notified even if the channel is role-gated (the mention itself
    // is the authorization signal). This matches the text-channel behavior in
    // server.ts.
    const isDirect = directSet.has(pubkey);
    const isReplyTarget = pubkey === replyToAuthorPubkey;
    const notifType = isDirect
      ? 'mention'
      : isReplyTarget
        ? 'reply'
        : everyoneBroadcast
          ? 'everyone'
          : 'mention';

    io.to(`pubkey:${pubkey}`).emit('notification', {
      type: notifType,
      channelId,
      serverId,
      messageId,
      postId: postId ?? undefined,
      senderPubkey: authorPubkey,
      preview,
      createdAt: createdAtIso,
    });

    // For forum threads, also bump the thread-level unread + flag.
    if (postId) {
      // Push the post meta so the client can add it to followed-posts
      // state immediately (no round-trip to /api/forum/posts/followed).
      if (postMeta) {
        io.to(`pubkey:${pubkey}`).emit('post-subscribed', {
          postId,
          title: postMeta.title,
          channelId,
          channelName: postMeta.channelName,
          serverId,
        });
      }
      io.to(`pubkey:${pubkey}`).emit('post-unread', {
        postId,
        messageId,
        authorPubkey,
        hasMention: true,
      });
    }
  }

  return { mentionedPubkeys: [...directMentions], everyoneBroadcast };
}

/**
 * Emit `unread-update` to every online server member who is NOT currently
 * in the channel room (so their sidebar bumps the channel count + mention
 * flag). Used by REST routes that persist messages outside server.ts's
 * `send-message` handler (forum create + reply).
 *
 * Read-permission gated: members who can't see the channel don't get a
 * badge that would leak the channel's existence.
 */
export async function fanOutChannelUnread(opts: {
  prisma: PrismaClient;
  io: any;
  channelId: string;
  serverId: string;
  authorPubkey: string;
  content: string;
  mentionedPubkeys: Set<string>;
  channel: { readPermission: string | null; readRoleIds?: string[] };
}): Promise<void> {
  const { prisma, io, channelId, serverId, authorPubkey, content, mentionedPubkeys, channel } = opts;

  const channelRoom = io.sockets.adapter.rooms.get(`channel:${channelId}`);
  const inChannelPubkeys = new Set<string>();
  if (channelRoom) {
    for (const sid of channelRoom) {
      const s = io.sockets.sockets.get(sid);
      if (s?.data?.pubkey) inChannelPubkeys.add(s.data.pubkey);
    }
  }

  const onlinePubkeys = new Set<string>();
  for (const s of io.sockets.sockets.values()) {
    if (s?.data?.pubkey) onlinePubkeys.add(s.data.pubkey);
  }

  const preview = content.slice(0, 100);
  for (const pubkey of onlinePubkeys) {
    if (pubkey === authorPubkey) continue;
    if (inChannelPubkeys.has(pubkey)) continue;
    if (channel.readPermission) {
      const access = await resolveMemberAccess(pubkey, serverId);
      if (!canReadChannel(access.role, channel as any, access.customRoleIds)) continue;
    }
    io.to(`pubkey:${pubkey}`).emit('unread-update', {
      channelId,
      serverId,
      hasMention: mentionedPubkeys.has(pubkey),
      preview,
    });
  }
}
