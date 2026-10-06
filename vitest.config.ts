import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/support/setup.ts'],
    globals: true,
    css: false,
    // Ceilings, not sleeps: these only decide how long a slow or contended
    // runner may take before a test is called hung. Nothing here should come
    // near them, but under 4x CPU contention the heavier component and crypto
    // suites tripped the 5 s default, which turned a slow machine into red CI.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // Tests live in tests/, mirroring src/ (tests/lib/foo.test.ts exercises
    // src/lib/foo.ts and imports it as `@/lib/foo`). src/ holds no tests and
    // is deliberately not collected: a test file placed there would never
    // run, so keep the pattern narrow rather than widening it.
    include: ['tests/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    server: {
      deps: {
        // Inline the SDK packages so `vi.mock` reaches the modules *they*
        // import. These used to be `file:` deps, which Vitest processed as
        // source, so mocking `nostr-tools/nip46` also intercepted the copy
        // Nip46Signer imports. Published packages are externalized by
        // default, which silently bypasses the mock and lets the NIP-46
        // handshake open a real WebSocket.
        // `vesta` ships TypeScript source, so it has to be inlined for
        // Vitest to transform it rather than hand it to Node as-is.
        // next-intl and use-intl are inlined so a test's `vi.mock('next/navigation')`
        // also reaches the router and pathname hooks next-intl wraps.
        inline: [/@nostr-wot\//, 'vesta', 'next-intl', 'use-intl'],
      },
    },
  },
  resolve: {
    alias: {
      '@tests': path.resolve(__dirname, './tests'),
      '@': path.resolve(__dirname, './src'),
      'server-only': path.resolve(__dirname, './tests/support/server-only-stub.ts'),
      // The real module needs React's `react-server` condition; see the stub.
      'next-intl/server': path.resolve(__dirname, './tests/support/next-intl-server.ts'),
      // Dedupe React across the symlinked SDK packages. Without these,
      // `@nostr-wot/data/react` (loaded as raw TS via file: deps) imports
      // its own copy of React from nostr-wot-sdk/node_modules, breaking
      // hooks because the contexts/dispatchers are different instances.
      react: path.resolve(__dirname, './node_modules/react'),
      'react-dom': path.resolve(__dirname, './node_modules/react-dom'),
    },
  },
});
