import type { ReactNode } from 'react';
import IntlScope from '@/i18n/IntlScope';
import AppProviders from './mounts/AppProviders';

/** Request-specific CSP nonces require a fresh document. */
export const dynamic = 'force-dynamic';

/** `/app`: the app's message modules (`SCOPES.app`) around the bridge. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <IntlScope scope="app">
      <AppProviders>{children}</AppProviders>
    </IntlScope>
  );
}
