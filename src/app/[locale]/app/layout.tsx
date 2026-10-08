import type { Viewport } from 'next';
import type { ReactNode } from 'react';
import IntlScope from '@/i18n/IntlScope';
import AppProviders from './mounts/AppProviders';

/** Request-specific CSP nonces require a fresh document. */
export const dynamic = 'force-dynamic';

/**
 * The chat shell manages its own gestures (swipes, pinch on media, the
 * composer that iOS would zoom into), so it alone turns off page zoom; the
 * public pages keep it, as readers need it.
 */
export const viewport: Viewport = { maximumScale: 1, userScalable: false };

/** `/app`: the app's message modules (`SCOPES.app`) around the bridge. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <IntlScope scope="app">
      <AppProviders>{children}</AppProviders>
    </IntlScope>
  );
}
