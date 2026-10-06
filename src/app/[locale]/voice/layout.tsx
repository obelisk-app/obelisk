import type { ReactNode } from 'react';
import IntlScope from '@/i18n/IntlScope';

/** `/voice` and `/voice/<id>` render the app's voice room: the app's modules. */
export default function VoiceLayout({ children }: { children: ReactNode }) {
  return <IntlScope scope="app">{children}</IntlScope>;
}
