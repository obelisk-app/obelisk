/**
 * React code gets the bridge from `<BridgeProvider>`, never from the page
 * slot.
 *
 * Inside the provider a component or hook reaches the bridge through the
 * hooks (`useGroups`, `useMyPubkey`, ...), `useBridge()` for imperative use,
 * `useAwaitBridge()` for a callback that may run before the bridge has
 * started, and `nostrActions` for the commands. `getBridge()` and
 * `getBridgeImpl()` are for code without a render tree (voice, stores, the
 * relay services). A React file that calls them works only while the page
 * slot happens to hold the right instance: a test has to mock the whole
 * bridge module instead of handing the provider a fake, and on a route
 * without a provider `getBridge()` quietly builds a bridge of its own.
 *
 * So no file under `src/components`, `src/app` or `src/hooks` names either
 * function, comments included (a comment naming one is usually a call that
 * moved, or advice to make one). The exceptions are below, each with its
 * reason; the list only shrinks.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOTS = ['src/components', 'src/app', 'src/hooks'];
const NAMES = /\bgetBridge(?:Impl)?\b/;

const EXCEPTIONS: Record<string, string> = {
  // The marketing navbar's "Disconnect" is the one place outside a provider
  // that needs the bridge, and only on that click. It loads the front door
  // with `await import(...)` there, which is why the landing and marketing
  // pages ship without the bridge (and why they have no provider to ask).
  'src/components/marketing/site/Navbar.tsx': 'lazy logout on the marketing pages',
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [relative(process.cwd(), path).split(sep).join('/')] : [];
  });
}

/** `file:line: text` for every line that names `getBridge` or `getBridgeImpl`. */
function mentions(file: string): string[] {
  return readFileSync(file, 'utf8')
    .split('\n')
    .flatMap((line, i) => (NAMES.test(line) ? [`${file}:${i + 1}: ${line.trim()}`] : []));
}

describe('React files reach the bridge through the provider', () => {
  const files = ROOTS.flatMap((root) => sourceFiles(root));

  it('is looking at the React tree, and the pattern matches both names', () => {
    expect(files.length).toBeGreaterThan(300);
    expect(NAMES.test('const live = getBridgeImpl();')).toBe(true);
    expect(NAMES.test('const bridge = await getBridge();')).toBe(true);
    expect(NAMES.test('const live = useBridge();')).toBe(false);
  });

  it('no file outside the exceptions names getBridge or getBridgeImpl', () => {
    const found = files.filter((f) => !(f in EXCEPTIONS)).flatMap(mentions);
    expect(found, 'use useBridge(), useAwaitBridge(), a bridge hook or nostrActions instead').toEqual([]);
  });

  it('every exception still needs its entry (the list only shrinks)', () => {
    for (const file of Object.keys(EXCEPTIONS)) {
      expect(mentions(file).length, `${file} no longer names the bridge getters: remove its exception`).toBeGreaterThan(0);
    }
  });

  it('the navbar reaches the bridge only through a dynamic import', () => {
    const navbar = readFileSync('src/components/marketing/site/Navbar.tsx', 'utf8');
    // A static import of the front door would put the whole bridge in the
    // landing page's first load, which the exception exists to avoid.
    expect(navbar).not.toMatch(/^\s*import\s+(?!type\b)[^;]*from\s+['"]@\/services\/nostr-bridge['"]/m);
    expect(navbar).toContain("await import('@/services/nostr-bridge')");
  });
});
