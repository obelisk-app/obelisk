'use client';

/**
 * The chat surface's client providers: the bridge around `/app`, and the
 * translator lent to non-React code (`RuntimeTranslator`).
 *
 * Not in the root layout on purpose. The root layout wraps the landing and
 * marketing pages too, and they stopped downloading the relay client in
 * round 16 (about 100 kB gzip off `/`); the bridge's front door is one
 * module, so mounting the provider there would bring all of it back. This
 * is the nearest layout that wraps the app. The routes outside it that still
 * use bridge hooks (`/notes/[id]`, `/t/[tag]`, `/r/[code]`, `/voice/[id]`)
 * keep working through the hooks' no-provider path until they get a
 * provider of their own.
 *
 * A client component because the front door re-exports the hooks, which a
 * server layout cannot import; `layout.tsx` (a server component, so it can
 * pick the message modules) renders it.
 */
import type { ReactNode } from 'react';
import { BridgeProvider } from '@/services/nostr-bridge';
import RuntimeTranslator from '@/components/i18n/RuntimeTranslator';

export default function AppProviders({ children }: { children: ReactNode }) {
  return (
    <BridgeProvider>
      <RuntimeTranslator />
      {children}
    </BridgeProvider>
  );
}
