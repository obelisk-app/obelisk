import type { ReactNode } from 'react';
import IntlScope from '@/i18n/IntlScope';

export default function HelpLayout({ children }: { children: ReactNode }) {
  return <IntlScope scope="guides">{children}</IntlScope>;
}
