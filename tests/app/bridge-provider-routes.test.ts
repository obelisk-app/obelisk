/**
 * Which routes mount `<BridgeProvider>`, read from the import graph.
 *
 * Outside a provider the bridge hooks answer their initial value forever
 * (logged out, no groups, no contact list) and nothing builds a bridge on a
 * component's behalf. So a page whose first load brings the bridge's front
 * door, which is what using a bridge hook means, must render under a
 * provider: `AppProviders` around `/app`, `BridgeRoute` on the other
 * routes. The other side is the reason the provider is not in the root
 * layout: a layout that mounts one hands the whole bridge to every page
 * below it, and the landing and marketing pages ship without it.
 *
 * A page's first load is the static closure of the page and every layout
 * above it (`import()` is a separate download, fetched on demand).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildImportGraph, staticClosure, staticPath } from '@tests/support/import-graph';

const APP = 'src/app';
const FRONT_DOOR = 'src/services/nostr-bridge/index.ts';
const PAGE = /^page(\.dev)?\.tsx$/;
const LAYOUTS = ['layout.tsx', 'layout.dev.tsx'];
const MOUNTS_PROVIDER = /<(BridgeProvider|BridgeRoute|AppProviders)\b/;

/** Pages that ship the bridge without a provider, each with its reason. Only shrinks. */
const WITHOUT_PROVIDER: Record<string, string> = {
  // The dev-only screenshot harness renders the game surfaces from fixture
  // logs. Its new-table form reads `useMyPubkey()`, which answers null here:
  // logged out, which is what the guide screenshots show.
  'src/app/dev/game-shots/page.dev.tsx': 'fixtures only, logged out on purpose',
};

/** Pages that must keep shipping without the bridge: the landing and the marketing pages. */
const NO_BRIDGE = [
  'src/app/[locale]/page.tsx',
  'src/app/[locale]/features/page.tsx',
  'src/app/[locale]/desktop/page.tsx',
  'src/app/[locale]/mobile/page.tsx',
  'src/app/[locale]/help/page.tsx',
  'src/app/[locale]/guides/page.tsx',
  'src/app/[locale]/media-kit/page.tsx',
];

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return pages(path);
    return PAGE.test(name) ? [path] : [];
  });
}

/** The page and every layout above it, nearest first. */
function chain(page: string): string[] {
  const out = [page];
  for (let dir = dirname(page); dir.startsWith(APP); dir = dirname(dir)) {
    for (const name of LAYOUTS) {
      const layout = join(dir, name);
      if (existsSync(layout)) out.push(layout);
    }
  }
  return out;
}

describe('BridgeProvider on the routes that use the bridge', () => {
  const graph = buildImportGraph();
  const all = pages(APP);
  const firstLoad = (page: string) => chain(page).flatMap((f) => [...staticClosure(graph, f)]);
  const shipsBridge = (page: string) => firstLoad(page).includes(FRONT_DOOR);
  const hasProvider = (page: string) => chain(page).some((f) => MOUNTS_PROVIDER.test(readFileSync(f, 'utf8')));

  it('finds the pages, and the bridge on /app', () => {
    expect(all.length).toBeGreaterThan(15);
    expect(shipsBridge('src/app/[locale]/app/page.tsx')).toBe(true);
    expect(hasProvider('src/app/[locale]/app/page.tsx')).toBe(true);
  });

  it('every page that ships the bridge renders under a provider', () => {
    const missing = all.filter((p) => !(p in WITHOUT_PROVIDER) && shipsBridge(p) && !hasProvider(p));
    expect(missing, 'mount BridgeRoute in the route\'s own layout or page').toEqual([]);
  });

  it('the public routes that use the bridge are among them', () => {
    for (const page of [
      'src/app/[locale]/notes/[id]/page.tsx',
      'src/app/[locale]/p/[id]/page.tsx',
      'src/app/[locale]/t/[tag]/page.tsx',
      'src/app/[locale]/r/[code]/page.tsx',
      'src/app/[locale]/voice/[channelId]/page.tsx',
    ]) {
      expect(shipsBridge(page), page).toBe(true);
      expect(hasProvider(page), page).toBe(true);
    }
  });

  it('no layout or provider brings the bridge to the landing or marketing pages', () => {
    const leaks = NO_BRIDGE.flatMap((page) => {
      for (const file of chain(page)) {
        const path = staticPath(graph, file, FRONT_DOOR);
        if (path) return [`${page}: ${path.join(' -> ')}`];
      }
      return [];
    });
    expect(leaks).toEqual([]);
    for (const page of NO_BRIDGE) expect(hasProvider(page), page).toBe(false);
  });

  it('a page that does not use the bridge is not handed one by a layout above it', () => {
    // The `/voice` form needs no bridge; `/voice/<id>` mounts its provider
    // on the page, not in `voice/layout.tsx`, for this reason.
    const handed = all.filter((p) => !staticClosure(graph, p).has(FRONT_DOOR) && shipsBridge(p));
    expect(handed).toEqual([]);
  });

  it('every exception still ships the bridge without a provider (the list only shrinks)', () => {
    for (const page of Object.keys(WITHOUT_PROVIDER)) {
      expect(shipsBridge(page) && !hasProvider(page), page).toBe(true);
    }
  });
});
