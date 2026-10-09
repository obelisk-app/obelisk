import { ensureDMStoreForAccount, useDMStore } from '@/store/chat/dm';

/** Remember list metadata without persisting decrypted message previews. */
export function rememberDmConversation(account: string | null, peer: string, createdAt: number): void {
  if (!account) return;
  ensureDMStoreForAccount(account);
  useDMStore.getState().rememberConversation(peer, createdAt);
}
