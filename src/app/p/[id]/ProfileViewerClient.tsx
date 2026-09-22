'use client';

/**
 * The public profile page's body — the same component the app uses.
 *
 * `/p` was a static kind-0 card: name, picture, bio, and a "Follow on
 * Obelisk" link that went to the app and dropped you nowhere in
 * particular. No notes, no tabs, no pagination — a profile page that
 * couldn't show you anything the person had written.
 *
 * Rather than build a second profile view that would drift from the real
 * one, this mounts `NostrProfile`: the same outbox-aware feed, the same
 * tabs, the same note cards, the same media grid. Server-fetched kind 0 is
 * handed in as `initialMeta` so the first paint keeps the name and bio the
 * page already had before the bridge connects.
 */

import { useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { nip19 } from 'nostr-tools';
import type { JsUserMetadata } from '@/lib/nostr-bridge';
import NostrProfile from '@/components/chat/NostrProfile';

/** Matches the app's own breakpoint for the phone presentation. */
const MOBILE_QUERY = '(max-width: 767px)';

export default function ProfileViewerClient({
  pubkey,
  initialMeta,
}: {
  pubkey: string;
  initialMeta: Partial<JsUserMetadata>;
}) {
  const router = useRouter();
  // `useSyncExternalStore` rather than state+effect: the server render has
  // no viewport, and this is the React-sanctioned way to read an external
  // value with an SSR fallback instead of setting state during an effect.
  const mobile = useSyncExternalStore(subscribeToViewport, isMobileViewport, () => false);

  return (
    <NostrProfile
      pubkey={pubkey}
      initialMeta={initialMeta}
      mobile={mobile}
      // On a page of its own there's nowhere to close *to*; the app is the
      // place with somewhere to go back to.
      onClose={() => router.push('/app')}
      onOpenProfile={(next) => router.push(`/p/${safeNpub(next)}`)}
    />
  );
}

function subscribeToViewport(onChange: () => void): () => void {
  const query = window.matchMedia(MOBILE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function isMobileViewport(): boolean {
  return window.matchMedia(MOBILE_QUERY).matches;
}

function safeNpub(pubkey: string): string {
  try {
    return nip19.npubEncode(pubkey);
  } catch {
    return pubkey;
  }
}
