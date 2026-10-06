import type { ReactNode } from 'react';
import IntlScope from '@/i18n/IntlScope';

/** The public viewers ship the social and chat modules (note cards, profiles). */
export default function ViewerLayout({ children }: { children: ReactNode }) {
  return <IntlScope scope="viewer">{children}</IntlScope>;
}
