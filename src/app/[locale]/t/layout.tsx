import type { ReactNode } from 'react';
import IntlScope from '@/i18n/IntlScope';
import BridgeRoute from '@/components/common/BridgeRoute';

/**
 * The public viewers ship the social and chat modules (note cards, profiles),
 * and the bridge: a signed-in reader can follow from here.
 */
export default function ViewerLayout({ children }: { children: ReactNode }) {
  return (
    <IntlScope scope="viewer">
      <BridgeRoute>{children}</BridgeRoute>
    </IntlScope>
  );
}
