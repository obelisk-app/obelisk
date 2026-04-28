import { useChatStore } from '@/store/chat';

// Resolve a player pubkey to the best display label we have: the member's
// nickname/displayName from the chat memberList, or a short hex fallback.
// "Vos" when the pubkey matches the current user.
export function usePlayerName(pubkey: string | null | undefined, myPubkey: string | null): string {
  const memberList = useChatStore((s) => s.memberList);
  if (!pubkey) return '—';
  if (pubkey === myPubkey) return 'Vos';
  const m = memberList.find((mm) => mm.pubkey === pubkey);
  if (m?.displayName) return m.displayName;
  return pubkey.slice(0, 8);
}

export function resolvePlayerName(
  pubkey: string | null | undefined,
  myPubkey: string | null,
  memberList: Array<{ pubkey: string; displayName: string }>,
): string {
  if (!pubkey) return '—';
  if (pubkey === myPubkey) return 'Vos';
  const m = memberList.find((mm) => mm.pubkey === pubkey);
  if (m?.displayName) return m.displayName;
  return pubkey.slice(0, 8);
}

export function resolvePlayerPicture(
  pubkey: string | null | undefined,
  memberList: Array<{ pubkey: string; picture?: string }>,
): string | null {
  if (!pubkey) return null;
  return memberList.find((mm) => mm.pubkey === pubkey)?.picture ?? null;
}
