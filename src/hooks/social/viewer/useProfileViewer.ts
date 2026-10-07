'use client';

import { useSyncExternalStore } from 'react';
import { useRouter } from '@/i18n/navigation';
import { safeNpub } from '@/utils/identity/short-npub';

/** Matches the app's own breakpoint for the phone presentation. */
const MOBILE_QUERY = '(max-width: 767px)';

function subscribeToViewport(onChange: () => void): () => void {
  const query = window.matchMedia(MOBILE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function isMobileViewport(): boolean {
  return window.matchMedia(MOBILE_QUERY).matches;
}

/**
 * The public profile page's body (`src/app/[locale]/p/[id]/ProfileViewerClient.tsx`):
 * whether to use the phone presentation, and where closing and opening
 * another person go on a page of its own.
 */
export function useProfileViewer() {
  const router = useRouter();
  // `useSyncExternalStore` rather than state+effect: the server render has
  // no viewport, and this is the React-sanctioned way to read an external
  // value with an SSR fallback instead of setting state during an effect.
  const mobile = useSyncExternalStore(subscribeToViewport, isMobileViewport, () => false);
  return {
    mobile,
    // On a page of its own there's nowhere to close *to*; the app is the
    // place with somewhere to go back to.
    close: () => router.push('/app'),
    openProfile: (next: string) => router.push(`/p/${safeNpub(next)}`),
  };
}
