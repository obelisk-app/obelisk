import type { ReactNode } from 'react';
import IntlScope from '@/i18n/IntlScope';
import BridgeRoute from '@/components/common/BridgeRoute';

/** Request-specific CSP nonces require a fresh document. */
export const dynamic = 'force-dynamic';

/** Keep the relay-join bridge alive across share-code navigation, with only join copy. */
export default function RelayShareLayout({ children }: { children: ReactNode }) {
  return (
    <IntlScope scope="relayShare">
      <BridgeRoute>{children}</BridgeRoute>
    </IntlScope>
  );
}
