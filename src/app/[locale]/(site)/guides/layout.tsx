import type { ReactNode } from 'react';
import IntlScope from '@/i18n/IntlScope';

export default function Layout({ children }: { children: ReactNode }) {
  return <IntlScope scope="guides">{children}</IntlScope>;
}
