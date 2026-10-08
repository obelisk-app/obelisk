'use client';

import LazyMediaLibraryModal from '@/components/media/library/LazyMediaLibraryModal';
import type { RelayEmojiSet } from '@/services/relay/relay-emojis';

export default function RelayEmojiAdminModal({
  relayUrl,
  emojiSet,
  onClose,
}: {
  relayUrl: string;
  emojiSet: RelayEmojiSet;
  configuredRelays: ReadonlyArray<string>;
  onClose: () => void;
}) {
  return (
    <LazyMediaLibraryModal
      onClose={onClose}
      server={{ relayUrl, emojiSet }}
      initialTab="server"
    />
  );
}
