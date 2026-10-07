'use client';

import RemoteImage from '@/components/ui/media/RemoteImage';

/** A bot's picture in the slash list, or a robot when it has none. */
export function BotAvatar({ picture, size }: { picture?: string | null; size: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9';
  if (picture) {
    return <RemoteImage src={picture} alt="" width={36} height={36} decoding="async" className={`${cls} shrink-0 rounded-full object-cover`} />;
  }
  return <span className={`flex ${cls} shrink-0 items-center justify-center rounded-full bg-lc-border text-sm`}>🤖</span>;
}
