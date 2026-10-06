'use client';

import { useChatStore } from '@/store/chat';
import type { RelayRole } from '@/services/relay-roles';

/**
 * The role to show next to a user's name. A user can hold any number of
 * relay roles; only the highest-tier one matters here. The store keeps each
 * pubkey's roles most-senior-first, so this is simply the head of that list
 * and falls back to the next role when an operator revokes the top one.
 */
export function useTopRole(pubkey: string): RelayRole | null {
  return useChatStore((state) => state.rolesByPubkey[pubkey]?.[0] ?? null);
}
