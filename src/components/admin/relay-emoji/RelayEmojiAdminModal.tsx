'use client';

import MediaLibraryModal from '@/components/media/library/MediaLibraryModal';
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
    <MediaLibraryModal
      onClose={onClose}
      server={{ relayUrl, emojiSet }}
      initialTab="server"
    />
  );
}
