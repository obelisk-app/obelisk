'use client';

/**
 * Side-by-side sandbox for the @nostr-wot/ui LoginWidget.
 *
 * Goal: exercise the SDK login UI inside obelisk-dex without touching
 * the production `src/app/app/LoginModal.tsx`. Only NIP-07 is wired
 * through to the bridge today — nsec/bunker/generate would require a
 * `bridge.loginWithSigner()` adapter and are intentionally disabled.
 *
 * See docs/nostr-wot-sdk-fork.md for the full migration plan.
 */

import { useState } from 'react';
import { LoginWidget, NostrSessionProvider } from '@nostr-wot/ui';
import { nostrActions } from '@/lib/nostr-bridge';
import { usePubkey, useSession } from '@nostr-wot/data/react';

export default function SdkLoginDevPage() {
  const myPubkey = usePubkey();
  const isLoggedIn = useSession().pubkey !== null;
  const [error, setError] = useState<string | null>(null);
  const [lastMethod, setLastMethod] = useState<string | null>(null);

  return (
    <NostrSessionProvider autoRestore={false} theme="la-crypta">
      <main className="min-h-screen bg-lc-black p-6 text-lc-white">
        <div className="mx-auto max-w-xl space-y-6">
          <header>
            <h1 className="text-2xl font-bold">SDK login sandbox</h1>
            <p className="mt-1 text-sm text-lc-muted">
              Renders <code className="rounded bg-lc-dark px-1.5 py-0.5">@nostr-wot/ui</code>{' '}
              <code className="rounded bg-lc-dark px-1.5 py-0.5">&lt;LoginWidget&gt;</code>{' '}
              and forwards NIP-07 logins to the bridge. Other methods are disabled
              pending a <code>bridge.loginWithSigner()</code> adapter.
            </p>
          </header>

          <section className="rounded-xl border border-lc-border bg-lc-dark p-4 text-sm">
            <div className="text-lc-muted">Bridge state:</div>
            <div className="mt-1 font-mono">
              isLoggedIn = {String(isLoggedIn)}
              {myPubkey && (
                <>
                  <br />
                  pubkey = {myPubkey.slice(0, 12)}…{myPubkey.slice(-6)}
                </>
              )}
            </div>
          </section>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </div>
          )}
          {lastMethod && (
            <div className="rounded-xl border border-lc-green/30 bg-lc-green/10 p-3 text-sm text-lc-green">
              Logged in via SDK widget — method: <code>{lastMethod}</code>
            </div>
          )}

          <div className="rounded-xl border border-lc-border bg-lc-dark p-4">
            <LoginWidget
              methods={['nip07']}
              hideAdvanced
              onLogin={async ({ pubkey, method }) => {
                setError(null);
                if (method !== 'nip07') {
                  throw new Error(`Method ${method} not yet wired to the bridge`);
                }
                await nostrActions.loginWithNip07(pubkey);
                setLastMethod(method);
              }}
              onError={(msg) => setError(msg)}
            />
          </div>
        </div>
      </main>
    </NostrSessionProvider>
  );
}
