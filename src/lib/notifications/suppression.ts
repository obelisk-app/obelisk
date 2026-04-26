// src/lib/notifications/suppression.ts
// Pure: should we suppress the OS popup + sound for this notification?
// Three suppression rules:
//   1. Actively reading: visible + focused + same channel/post + at bottom
//   2. Muted (scope-resolved) or notifyLevel=nothing
//   3. Own-message echo (sender = viewer)

import type { ScopeRef } from '@/lib/server/scope-chain';
import type { ResolvedPref } from './prefs';

export interface NotificationPayload {
  recipientPubkey: string;
  type: 'mention' | 'reply' | 'everyone' | 'dm';
  serverId?: string;
  channelId?: string;
  postId?: string;
  messageId?: string;
  senderPubkey: string;
  preview?: string;
  createdAt: string;
  scopeChain: ScopeRef[];
  senderName?: string;
}

export interface SuppressionContext {
  viewerPubkey: string;
  documentVisible: boolean;
  windowFocused: boolean;
  activeChannelId: string | null;
  activePostId: string | null;
  scrolledToBottom: boolean;
  resolvedPref: ResolvedPref;
}

export function shouldSuppress(
  p: NotificationPayload,
  ctx: SuppressionContext,
): boolean {
  // 3. Own-message echo
  if (p.senderPubkey === ctx.viewerPubkey) return true;

  // 2. Muted / nothing
  if (ctx.resolvedPref.notifyLevel === 'nothing') return true;
  if (ctx.resolvedPref.mutedUntil && ctx.resolvedPref.mutedUntil > new Date()) return true;

  // 1. Actively reading
  const inChannel =
    ctx.documentVisible &&
    ctx.windowFocused &&
    ctx.activeChannelId !== null &&
    ctx.activeChannelId === p.channelId &&
    ctx.scrolledToBottom;
  const samePostOrChannelOnly =
    !p.postId || p.postId === ctx.activePostId;
  if (inChannel && samePostOrChannelOnly) return true;

  return false;
}
