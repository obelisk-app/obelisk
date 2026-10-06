'use client';

import NostrProfile from '@/components/chat/NostrProfile';

export function ProfileViewScreen({
  pubkey,
  back,
  openDm,
}: {
  pubkey: string;
  back: () => void;
  openDm: (peer: string) => void;
}) {
  return <NostrProfile mobile pubkey={pubkey} onClose={back} onMessage={openDm} />;
}

// ───────────────────────────────────────────────────────────────────────────
// 10 - member list
