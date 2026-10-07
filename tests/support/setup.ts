import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/dom';
import { afterAll, afterEach, vi } from 'vitest';
import { setRootLocale } from './root-params';

// jsdom doesn't implement scrollIntoView.
if (typeof Element !== 'undefined') {
  Element.prototype.scrollIntoView = () => {};
}

// Fix Event mismatch in Node 22 + jsdom
// Undici (used by built-in fetch/websocket) expects the real Node Event,
// but jsdom replaces it.
if (typeof window !== 'undefined') {
    // Check if we are in a Node environment that has these
    if ((global as any).Event) {
        (window as any).Event = (global as any).Event;
    }
    if ((global as any).MessageEvent) {
        (window as any).MessageEvent = (global as any).MessageEvent;
    }
    if ((global as any).CloseEvent) {
        (window as any).CloseEvent = (global as any).CloseEvent;
    }
    if ((global as any).ErrorEvent) {
        (window as any).ErrorEvent = (global as any).ErrorEvent;
    }
}

// Testing Library's `waitFor` / `findBy*` give up after 1 s by default. That
// is a ceiling on how long a slow machine may take, not a wait the tests
// perform, so a generous value costs nothing on a fast run and stops a
// contended CI runner from failing tests that merely took longer. Tests that
// need a specific moment use fake timers; this only widens the fallback.
configure({ asyncUtilTimeout: 5_000 });

/**
 * No unit test may open a real network socket.
 *
 * jsdom's `WebSocket` is a thin wrapper over undici's, so an unmocked relay
 * read inside a component test really does dial relay.damus.io from CI. The
 * symptom was a run with every test green and exit code 1: the connect
 * finished after the test had ended and undici raised "The 'event' argument
 * must be an instance of Event" as an unhandled error. Whether that happened
 * depended on how fast the worker was torn down, i.e. on load.
 *
 * The replacement constructor throws, so the caller fails fast the same way
 * an unreachable relay would (nostr-tools turns it into a rejected connect),
 * and records the attempt so the test that caused it fails with the URL and
 * the stack that built the socket, instead of a later unrelated run going
 * red. Tests that need a socket double install their own with
 * `vi.stubGlobal('WebSocket', Fake)`; `vi.unstubAllGlobals()` restores this.
 */
const realSocketAttempts: Array<{ url: string; stack: string }> = [];

class NoNetworkWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  constructor(url: string | URL) {
    super();
    const limit = Error.stackTraceLimit;
    Error.stackTraceLimit = 40;
    const stack = new Error().stack ?? '';
    Error.stackTraceLimit = limit;
    realSocketAttempts.push({ url: String(url), stack });
    throw new Error(
      `Unit tests must not open a real WebSocket (tried ${String(url)}). Mock the module that owns the transport.`,
    );
  }
}

(globalThis as unknown as { WebSocket: unknown }).WebSocket = NoNetworkWebSocket;

function failOnRealSockets(): void {
  if (realSocketAttempts.length === 0) return;
  const attempts = realSocketAttempts.splice(0);
  const urls = [...new Set(attempts.map((a) => a.url))].join(', ');
  throw new Error(
    `This test tried to open ${attempts.length} real WebSocket(s): ${urls}\n` +
    `Mock the module that owns the transport. First attempt:\n${attempts[0].stack}`,
  );
}

afterEach(failOnRealSockets);
afterAll(failOnRealSockets);

/**
 * Nor may a unit test make a real `fetch`.
 *
 * Same class of defect as the socket above, one layer up. jsdom resolves a
 * relative URL against its own origin (http://localhost:3000), so a component
 * whose mount effect calls `fetch('/api/...')` really connects: to nothing on
 * CI, to whatever dev server happens to be on that port locally. The result
 * depended on the machine, which is exactly what a unit test must not do.
 *
 * The replacement rejects the way undici does for an unreachable host, so
 * the caller takes its normal failure path, and records the attempt so the
 * test that made it fails with the URL and the stack. Tests that need a
 * response install their own double with `vi.stubGlobal('fetch', fn)`;
 * `vi.unstubAllGlobals()` restores this one.
 */
const realFetchAttempts: Array<{ url: string; stack: string }> = [];

function noNetworkFetch(input: RequestInfo | URL): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = 40;
  const stack = new Error().stack ?? '';
  Error.stackTraceLimit = limit;
  realFetchAttempts.push({ url, stack });
  return Promise.reject(
    new TypeError(`Unit tests must not fetch over the network (tried ${url}). Stub fetch or mock the module that calls it.`),
  );
}

globalThis.fetch = noNetworkFetch as typeof fetch;

function failOnRealFetches(): void {
  if (realFetchAttempts.length === 0) return;
  const attempts = realFetchAttempts.splice(0);
  const urls = [...new Set(attempts.map((a) => a.url))].join(', ');
  throw new Error(
    `This test made ${attempts.length} real fetch call(s): ${urls}\n` +
    `Stub fetch or mock the module that calls it. First attempt:\n${attempts[0].stack}`,
  );
}

afterEach(failOnRealFetches);
afterAll(failOnRealFetches);

/**
 * Components outside a mounted App Router still get a router.
 *
 * The language picker (`useSwitchLocale`) and every locale-aware `Link` go
 * through next-intl, which calls `next/navigation`'s `useRouter()`; that
 * throws "expected app router to be mounted" in a bare `render()`. Settings
 * screens render the picker, so every test that mounts them would need its
 * own router mock. Here the real hook is tried first and a no-op router
 * stands in only when there is no router at all. A test that wants to
 * watch navigation mocks `@/i18n/navigation` itself
 * (`@tests/support/mocks/i18n-navigation`).
 */
vi.mock('next/navigation', async (importOriginal) => {
  const real = await importOriginal<typeof import('next/navigation')>();
  const noop = () => {};
  const fallback = { push: noop, replace: noop, prefetch: noop, back: noop, forward: noop, refresh: noop };
  return {
    ...real,
    useRouter: () => {
      try {
        return real.useRouter();
      } catch {
        return fallback;
      }
    },
  };
});

// The route-level message provider is an async server component; see the stand-in.
vi.mock('@/i18n/IntlScope', async () => ({ default: (await import('./intl-scope')).default }));

// Each test names its own `[locale]` segment (tests/support/root-params.ts).
afterEach(() => setRootLocale(undefined));
