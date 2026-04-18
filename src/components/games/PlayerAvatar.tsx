'use client';

import { useChatStore } from '@/store/chat';
import { resolvePlayerName, resolvePlayerPicture } from '@/lib/games/player-name';

interface Props {
  pubkey: string;
  myPubkey?: string | null;
  size?: number;
  className?: string;
}

// Circular avatar fallback: if no profile picture, show the first letter
// of the resolved name (or ? as a last resort) on a lc-olive disc.
export default function PlayerAvatar({ pubkey, myPubkey = null, size = 28, className = '' }: Props) {
  const memberList = useChatStore((s) => s.memberList);
  const picture = resolvePlayerPicture(pubkey, memberList);
  const name = resolvePlayerName(pubkey, myPubkey, memberList);
  const initial = (name || pubkey || '?').trim().slice(0, 1).toUpperCase();

  if (picture) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={picture}
        alt={name}
        width={size}
        height={size}
        className={`rounded-full object-cover border border-lc-border shrink-0 ${className}`}
        style={{ width: size, height: size }}
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
      />
    );
  }
  return (
    <div
      className={`rounded-full bg-lc-olive text-lc-green flex items-center justify-center font-semibold shrink-0 ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.42) }}
      aria-label={name}
    >
      {initial}
    </div>
  );
}
