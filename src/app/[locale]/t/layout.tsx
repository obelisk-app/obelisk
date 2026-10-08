import type { ReactNode } from 'react';
import IntlScope from '@/i18n/IntlScope';
import BridgeRoute from '@/components/common/BridgeRoute';

/** Persist the follow bridge across hashtag navigation, with only follow controls. */
export default function ViewerLayout({ children }: { children: ReactNode }) {
  return (
    <IntlScope scope="hashtag">
      <BridgeRoute>{children}</BridgeRoute>
    </IntlScope>
  );
}
