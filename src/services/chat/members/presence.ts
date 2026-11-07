import { useChatStore } from '@/store/chat';
import { presenceActivityKey } from '@/utils/chat/members/presence';

/** Confirmed relay activity, shared by message delivery and the presence backfill. */
export function recordMemberActivity(relay: string, pubkey: string, createdAt: number): void {
  if (!relay || !pubkey || !Number.isFinite(createdAt) || createdAt <= 0) return;
  const atMs = Math.min(createdAt * 1000, Date.now());
  useChatStore.getState().recordActivity(presenceActivityKey(relay, pubkey), atMs);
}
