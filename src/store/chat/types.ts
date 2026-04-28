import type { MemberInfo } from '@/lib/mentions';

export type { MemberInfo };

export interface ForumTag {
  id: string;
  name: string;
  color: string;
}

export interface Channel {
  id: string;
  name: string;
  emoji: string | null;
  description?: string | null;
  type: string;
  position: number;
  categoryId: string | null;
  forumTags?: ForumTag[];
  /** null/"everyone" = anyone, "mod" = mods+, "admin" = admins+. */
  writePermission?: string | null;
  /** "mesh" (P2P) or "sfu" (LiveKit). Only meaningful for voice channels. */
  voiceMode?: string | null;
}

export interface Category {
  id: string;
  name: string;
  position: number;
  channels: Channel[];
}

export interface Reaction {
  id: string;
  messageId: string;
  authorPubkey: string;
  emoji: string;
}

export interface EmbeddedAuthor {
  pubkey: string;
  displayName: string | null;
  picture: string | null;
  nip05: string | null;
  nickname: string | null;
}

export interface Message {
  id: string;
  channelId: string;
  authorPubkey: string;
  content: string;
  replyToId: string | null;
  createdAt: string;
  editedAt: string | null;
  pinnedAt?: string | null;
  pinnedByPubkey?: string | null;
  replyTo?: { id: string; content: string; authorPubkey: string } | null;
  reactions?: Reaction[];
  // Embedded author profile attached by the server on Socket.io emits,
  // so clients never need to wait for a separate profile fetch.
  author?: EmbeddedAuthor | null;
}

export type MyServerRole = 'owner' | 'admin' | 'mod' | 'member' | null;

export interface ServerInfo {
  id: string;
  name: string;
  icon: string | null;
  banner: string | null;
  ownerPubkey?: string;
}

// One row of the server's GIF library. Mirrors the shape returned by GET
// /api/gifs (member-facing) — a minimal view that omits admin-only fields
// like `uploadedBy` and `sizeBytes`.
export interface SlugCacheEntry {
  channelName: string | null;
  channelId: string | null;
  serverId: string | null;
  postTitle: string | null;
  messageAuthorName: string | null;
  noAccess: boolean;
  notFound: boolean;
  loading: boolean;
}

export function slugCacheKey(slug: string, opts?: { p?: string; m?: string }): string {
  return `${slug}|p=${opts?.p ?? ''}|m=${opts?.m ?? ''}`;
}

export interface ServerGif {
  id: string;
  name: string;
  url: string;
  tags: string; // comma-separated, lowercased
  width: number | null;
  height: number | null;
}

export interface EphemeralMessage {
  id: string;
  text: string;
  createdAt: string;
}

export interface FollowedPostMetaEntry {
  id: string;
  title: string;
  channelId: string;
  channelName: string;
  serverId: string;
}

export interface InvoicePayment {
  paymentHash: string;
  payerPubkey: string;
  paidAt: string;
}
