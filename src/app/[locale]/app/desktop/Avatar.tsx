'use client';

import RemoteImage from '@/components/ui/media/RemoteImage';
import { avatarHue, avatarInitials } from '@/utils/shell/desktop/avatar';
import { hideBrokenImage } from '@/utils/media/remote/hide-broken-image';

export function Avatar({ pubkey, size, picture }: { pubkey: string; size: number; picture: string | null }) {
  const px = `${size * 4}px`;
  if (picture) {
    return (
      <RemoteImage
        src={picture}
        alt=""
        style={{ width: px, height: px }}
        className="rounded-full bg-lc-card object-cover"
        onError={hideBrokenImage}
      />
    );
  }
  return (
    <div
      style={{ width: px, height: px, background: `hsl(${avatarHue(pubkey)} 60% 30%)` }}
      className="flex items-center justify-center rounded-full font-mono text-[10px] font-bold text-lc-white"
    >
      {avatarInitials(pubkey)}
    </div>
  );
}
