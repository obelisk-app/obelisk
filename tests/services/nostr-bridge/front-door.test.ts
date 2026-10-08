/**
 * The bridge has one public entrance, `@/services/nostr-bridge` (its `index.ts`),
 * and tests fake the bridge by mocking exactly that path. A module outside
 * the bridge that imports `@/services/nostr-bridge/facade/client` (or any other file
 * inside the folder) walks past the fake: the real module loads inside a test
 * that believed the bridge was faked.
 *
 * It happened for real: `src/services/voice/sfu-pin.ts` pulled the real
 * 4,000-line client into `ChannelSettingsModal.test.tsx`, the load finished
 * after the test environment was gone, and a fully green run exited 1.
 *
 * So this reads the source: no file outside `src/services/nostr-bridge/` may name
 * a path inside it, by alias or by relative path, statically or through
 * `import()`, except the files on the allow-list below, each with its reason.
 * The list only shrinks: an entry whose file no longer needs it fails too.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const BRIDGE = join(SRC, 'services', 'nostr-bridge');
const FRONT_DOOR = join(BRIDGE, 'index');

/**
 * Files that still use a side entrance, keyed by path from the repo root,
 * with the exact internal paths they may name and why.
 */
const SIDE_ENTRANCE_ALLOW_LIST: Readonly<Record<string, { paths: readonly string[]; why: string }>> = {
  // Cycles: the bridge itself loads these files, so going through index.ts
  // would make them import the module that is halfway through loading them.
  'src/services/common/quota-safe-storage.ts': {
    paths: ['@/services/nostr-bridge/cache/cache'],
    why: 'cycle: nostr-bridge/dm/send.ts -> store/dm.ts -> quota-safe-storage.ts',
  },
  'src/services/wot/extension.ts': {
    paths: ['@/services/nostr-bridge/session/signer-queue'],
    why: 'cycle: nostr-bridge/dm/inbox.ts -> wot/engine.ts -> wot/extension.ts',
  },
  // Deliberate light leaves.
  'src/services/social/pool.ts': {
    paths: ['@/services/nostr-bridge/facade/page-hub'],
    why:
      'runs pageRelayHub() at import time and wants only the hub, not the index ' +
      '(which loads the whole client); untangle by giving the page hub its own public home',
  },

};

/** `from '...'`, `import '...'` and `import('...')`, across line breaks. */
const SPECIFIER_RE = /\bfrom\s+['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s+['"]([^'"]+)['"]/gm;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return path === BRIDGE ? [] : sourceFiles(path);
    return /\.(ts|tsx|mts|js|jsx|mjs)$/.test(name) ? [path] : [];
  });
}

/** The extensionless absolute path a specifier names, or null for a package. */
function target(file: string, spec: string): string | null {
  if (spec.startsWith('@/')) return join(SRC, spec.slice(2));
  if (spec.startsWith('.')) return resolve(dirname(file), spec);
  return null;
}

function stripExtension(path: string): string {
  return path.replace(/\.(ts|tsx|mts|js|jsx|mjs)$/, '').replace(/[\\/]index$/, '');
}

/** The bridge-internal specifiers one source text names, in order. */
function sideEntrances(file: string, text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(SPECIFIER_RE)) {
    const spec = match[1] ?? match[2] ?? match[3];
    if (!spec) continue;
    const abs = target(file, spec);
    if (!abs) continue;
    const bare = stripExtension(abs);
    if (bare === BRIDGE || bare === stripExtension(FRONT_DOOR)) continue;
    if (bare.startsWith(BRIDGE + sep)) found.push(spec);
  }
  return found;
}

function scan(): Map<string, string[]> {
  const byFile = new Map<string, string[]>();
  for (const path of sourceFiles(SRC)) {
    const found = sideEntrances(path, readFileSync(path, 'utf8'));
    if (found.length > 0) byFile.set(relative(ROOT, path).split(sep).join('/'), [...new Set(found)].sort());
  }
  return byFile;
}

describe('the bridge front door', () => {
  const byFile = scan();

  // Without this the guard passes vacuously after a move: it would scan for
  // imports into a folder that no longer exists and find none. Pointing BRIDGE
  // at the pre-restructure path leaves the check below green; this one fails.
  it('is looking at a bridge that exists, through a front door the app really uses', () => {
    expect(statSync(BRIDGE).isDirectory()).toBe(true);
    expect(existsSync(`${FRONT_DOOR}.ts`)).toBe(true);
    const frontDoorUsers = sourceFiles(SRC).filter((file) =>
      /from\s+['"]@\/services\/nostr-bridge['"]/.test(readFileSync(file, 'utf8')),
    );
    expect(frontDoorUsers.length).toBeGreaterThan(50);
  });

  it('is the only way into src/services/nostr-bridge from the rest of src/', () => {
    const offenders: string[] = [];
    for (const [file, specs] of byFile) {
      const allowed = SIDE_ENTRANCE_ALLOW_LIST[file]?.paths ?? [];
      for (const spec of specs) {
        if (!allowed.includes(spec)) offenders.push(`${file}: ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps no stale allow-list entry', () => {
    const stale: string[] = [];
    for (const [file, { paths }] of Object.entries(SIDE_ENTRANCE_ALLOW_LIST)) {
      const used = byFile.get(file) ?? [];
      for (const spec of paths) {
        if (!used.includes(spec)) stale.push(`${file}: ${spec}`);
      }
    }
    expect(stale).toEqual([]);
  });

  it('sees every form of side entrance, and lets the front door through', () => {
    const file = join(SRC, 'services', 'example.ts');
    const text = [
      "import { getBridge } from '@/services/nostr-bridge/facade/client';",
      "import type { JsMessage } from '@/services/nostr-bridge/common/types';",
      'import {',
      '  cacheGet,',
      "} from './nostr-bridge/cache';",
      "export { x } from '../services/nostr-bridge/relay-url';",
      "const lazy = () => import('@/services/nostr-bridge/facade/page-hub');",
      "import { nostrActions } from '@/services/nostr-bridge';",
      "import { y } from '@/services/nostr-bridge/index';",
      "import { z } from '@/services/nostr-bridge-adjacent';",
    ].join('\n');
    expect(sideEntrances(file, text)).toEqual([
      '@/services/nostr-bridge/facade/client',
      '@/services/nostr-bridge/common/types',
      './nostr-bridge/cache',
      '../services/nostr-bridge/relay-url',
      '@/services/nostr-bridge/facade/page-hub',
    ]);
  });
});
