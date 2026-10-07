'use client';

import RemoteImage from '@/components/ui/media/RemoteImage';

/** A custom emoji drawn inline in message text. */
export function CustomEmojiImg({ name, url }: { name: string; url: string }) {
  return (
    <RemoteImage
      src={url}
      alt={`:${name}:`}
      title={`:${name}:`}
      className="inline-block w-5 h-5 align-text-bottom object-contain"
      data-testid="custom-emoji"
    />
  );
}
