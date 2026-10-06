'use client';

/**
 * `<BridgeProvider>` for a route outside `/app` whose components use the
 * bridge: the public viewers (`/notes/<id>`, `/p/<id>`, `/t/<tag>`), the
 * relay share link (`/r/<code>`) and a voice room (`/voice/<id>`). Without
 * it their bridge hooks would answer their initial value forever (logged
 * out, no contact list), since nothing outside a provider creates a bridge.
 *
 * Mounted by those routes' own layouts or pages, never by a layout that
 * also wraps the landing or marketing pages: the bridge's front door is one
 * module, and those pages ship without it. `/app` has its own
 * (`AppProviders`). `tests/app/bridge-provider-routes.test.ts` checks both
 * sides.
 *
 * A client component because the front door re-exports the hooks, which a
 * server layout cannot import.
 */
import type { ReactNode } from 'react';
import { BridgeProvider } from '@/services/nostr-bridge';

export default function BridgeRoute({ children }: { children: ReactNode }) {
  return <BridgeProvider>{children}</BridgeProvider>;
}
