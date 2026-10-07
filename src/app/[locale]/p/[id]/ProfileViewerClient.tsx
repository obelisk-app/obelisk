'use client';

/**
 * The public profile page's body - the same component the app uses.
 *
 * `/p` was a static kind-0 card: name, picture, bio, and a "Follow on
 * Obelisk" link that went to the app and dropped you nowhere in
 * particular. No notes, no tabs, no pagination - a profile page that
 * couldn't show you anything the person had written.
 *
 * Rather than build a second profile view that would drift from the real
 * one, this mounts `NostrProfile`: the same outbox-aware feed, the same
 * tabs, the same note cards, the same media grid. Server-fetched kind 0 is
 * handed in as `initialMeta` so the first paint keeps the name and bio the
 * page already had before the bridge connects.
 */

import type { JsUserMetadata } from '@/services/nostr-bridge';
import NostrProfile from '@/components/chat/profile/NostrProfile';
import { useProfileViewer } from '@/hooks/social/viewer/useProfileViewer';

export default function ProfileViewerClient({
  pubkey,
  initialMeta,
}: {
  pubkey: string;
  initialMeta: Partial<JsUserMetadata>;
}) {
  const vm = useProfileViewer();

  return (
    <NostrProfile
      pubkey={pubkey}
      initialMeta={initialMeta}
      mobile={vm.mobile}
      onClose={vm.close}
      onOpenProfile={vm.openProfile}
    />
  );
}
