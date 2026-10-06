import type { Viewport } from 'next';
import type { ReactNode } from 'react';
import IntlScope from '@/i18n/IntlScope';

/** A call screen, like the app shell: no page zoom. */
export const viewport: Viewport = { maximumScale: 1, userScalable: false };

/** `/voice` and `/voice/<id>` render the app's voice room: the app's modules. */
export default function VoiceLayout({ children }: { children: ReactNode }) {
  return <IntlScope scope="app">{children}</IntlScope>;
}
