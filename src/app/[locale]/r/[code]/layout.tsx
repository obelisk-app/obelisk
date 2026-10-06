import type { ReactNode } from 'react';
import IntlScope from '@/i18n/IntlScope';
import BridgeRoute from '@/components/BridgeRoute';

/** The share link joins a relay in the app, so it ships the app's modules and the bridge. */
export default function RelayShareLayout({ children }: { children: ReactNode }) {
  return (
    <IntlScope scope="app">
      <BridgeRoute>{children}</BridgeRoute>
    </IntlScope>
  );
}
