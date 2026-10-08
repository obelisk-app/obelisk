import type { ReactNode } from 'react';
import IntlScope from '@/i18n/IntlScope';
import BridgeRoute from '@/components/common/BridgeRoute';

/** Request-specific CSP nonces require a fresh document. */
export const dynamic = 'force-dynamic';

/** Persist the follow bridge across hashtag navigation, with only follow controls. */
export default function ViewerLayout({ children }: { children: ReactNode }) {
  return (
    <IntlScope scope="hashtag">
      <BridgeRoute>{children}</BridgeRoute>
    </IntlScope>
  );
}
