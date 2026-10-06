import type { ReactNode } from 'react';
import IntlScope from '@/i18n/IntlScope';
import '@nostr-wot/ui/styles.css';
import '../globals.css';

/**
 * Root layout for the dev-only routes (`/dev/game-shots`). They sit outside
 * `[locale]`, so this owns `<html>`; the copy is English, the default.
 */
export default function DevLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-lc-black text-lc-white antialiased">
        <IntlScope scope="app">{children}</IntlScope>
      </body>
    </html>
  );
}
