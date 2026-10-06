'use client';

import RemoteImage from '@/components/ui/RemoteImage';

export function Avatar({ pubkey, size, picture }: { pubkey: string; size: number; picture: string | null }) {
  const px = `${size * 4}px`;
  if (picture) {
    return (
      <RemoteImage
        src={picture}
        alt=""
        style={{ width: px, height: px }}
        className="rounded-full bg-lc-card object-cover"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = 'none';
        }}
      />
    );
  }
  const hue = parseInt(pubkey.slice(0, 6), 16) % 360;
  return (
    <div
      style={{ width: px, height: px, background: `hsl(${hue} 60% 30%)` }}
      className="flex items-center justify-center rounded-full font-mono text-[10px] font-bold text-lc-white"
    >
      {pubkey.slice(0, 2).toUpperCase()}
    </div>
  );
}
