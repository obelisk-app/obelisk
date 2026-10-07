import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The owner's folder rules (round 28, docs/conventions.md#where-a-file-goes):
 *
 * 1. Nothing loose at a layer's root. Code used across features goes in
 *    `common/` (or a clearly named shared topic folder), the rest in its
 *    feature folder.
 * 2. The same feature names in every layer: a layer's top-level folders come
 *    from one module map (`MODULES`), plus the few folders that only one layer
 *    has, each with its reason; and one folder name is spelled one way
 *    everywhere (`dm-call` and `call`, `feed-screen` and `feed`, `messages` and
 *    `message` were the kind of drift this catches).
 * 3. A feature folder that has sub-folders holds no loose files except its
 *    `index` or its entry component (`ENTRY`); every other file sits in a
 *    sub-feature.
 * 4. Every `src/lib/` mini-package is a folder with an `index.ts`.
 *
 * `src/assets/` (round 31) is a layer too: nothing loose at its root, and its
 * top-level folders are the asset kinds in its `LAYER_ONLY` list (`icons`,
 * `brand`, `illustrations`, `textures`), never feature names. Inside a kind,
 * the feature names hold (`illustrations/guides`, `illustrations/seo`).
 *
 * The app router follows rule 3 too: Next.js route files stay where routing
 * needs them, every other file of a folder with sub-folders sits in one.
 *
 * The lists below only shrink: an entry that no longer matches anything fails
 * the "still needed" case.
 */

const ROOT = process.cwd();
const LAYERS = ['src/components', 'src/hooks', 'src/services', 'src/utils', 'src/store', 'src/lib', 'src/assets'] as const;
/** Layers whose top-level folders are their own kinds, not features: lib packages and asset kinds. */
const OWN_LIST_ONLY = new Set<string>(['src/lib', 'src/assets']);
/** Rule 3 also covers the route tree, where only its non-route files are held to it. */
const RULE3_ROOTS = [...LAYERS, 'src/app'] as const;

/** The module map: the feature folders, spelled the same in every layer that has code for them. */
export const MODULES = [
  'admin', 'analytics', 'call', 'chat', 'common', 'feedback', 'games', 'guides', 'help', 'hints', 'i18n',
  'identity', 'local-data', 'login', 'marketing', 'media', 'media-kit', 'moderation', 'notifications',
  'preferences', 'read-state', 'relay', 'seo', 'settings', 'shell', 'social', 'voice', 'wallet', 'wot',
] as const;

/** Top-level folders that exist in one layer only, and why they are not modules. */
export const LAYER_ONLY: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'src/components': {
    ui: 'the design-system kit, grouped by kind (buttons, forms, overlays, ...); every feature renders it',
  },
  'src/services': {
    'nostr-bridge': 'the bridge: session, relay rail, groups and DMs behind one front door (index.ts)',
    server: 'code that only runs on the server: the public viewers, OpenGraph cards, the link-preview API',
  },
  'src/utils': {
    attachments: 'shared topic: file-attachment limits and tags, read by chat, social, DMs and the bridge',
    errors: 'shared topic: coded errors and the sentence the UI shows for any thrown value',
    format: 'shared topic: dates, counts, byte sizes and relative times',
    layout: 'shared topic: popover placement and scroll behaviour',
    'link-preview': 'shared topic: the preview record the chat card and the server route both read',
    'message-text': 'shared topic: markdown, mentions, emoji shortcodes and links in chat and social text',
    nip46: 'shared topic: NIP-46 signer links',
    nostr: 'shared topic: event kinds and the kinds a signer may be asked to sign',
    'relay-url': 'shared topic: normalising, sharing and styling relay URLs',
    security: 'shared topic: the Content-Security-Policy the proxy sends',
    storage: 'shared topic: safe JSON and localStorage reads and writes',
    style: 'shared topic: class-name joining',
    url: 'shared topic: http(s) URL checks',
  },
  'src/assets': {
    icons: 'every UI icon, one file per icon, drawn on IconSvg; the index.ts barrel lists them',
    brand: 'the Obelisk marks (the app icon silhouette, the two-tone Obelisco, the OG card mark) and other brand marks',
    illustrations: 'artwork that is not an icon: guide heroes, diagrams and marks, OG card art, game thumbnails, landing decoration',
    textures: 'image files the stylesheets reference with url(), such as the background noise',
  },
  'src/lib': {
    crypto: 'mini-package: the session vault and the record and file ciphers',
    emoji: 'mini-package: the emoji catalog and keyword search',
    games: 'mini-package: the game protocol, replay and rules engines',
    'nip-59': 'mini-package: NIP-59 gift wrap for self',
    nwc: 'mini-package: Nostr Wallet Connect (NIP-47) client',
    'relay-hub': 'mini-package: the relay connection owner',
    'remark-spoiler': 'mini-package: the remark plugin for spoiler text',
  },
};

/**
 * A folder with sub-folders may keep its entry component beside them: the one
 * file the rest of the app imports to show the feature.
 */
export const ENTRY: Readonly<Record<string, string>> = {
  'src/app/[locale]/app': 'AppGate.tsx',
  'src/app/[locale]/app/mobile': 'PhoneShell.tsx',
  'src/app/[locale]/help': 'HelpIndex.tsx',
  'src/app/[locale]/media-kit': 'MediaKit.tsx',
  'src/app/[locale]/voice': 'VoiceRoomForm.tsx',
  'src/components/marketing': 'LandingPage.tsx',
  'src/components/social': 'FeedScreen.tsx',
};

/** Two spellings of one folder name that are both meant, with the reason. None today. */
export const ALLOWED_VARIANTS: Readonly<Record<string, string>> = {};

/** Files Next.js finds by name (a `.dev` variant included), which live where the router wants them. */
const NEXT_CONVENTIONS = new Set([
  'route', 'page', 'layout', 'loading', 'error', 'global-error', 'not-found', 'template', 'default',
  'sitemap', 'robots', 'manifest', 'opengraph-image', 'twitter-image', 'icon', 'apple-icon',
]);

const CODE = /\.(ts|tsx|mts|js|jsx|mjs)$/;

export function isNextConvention(file: string): boolean {
  if (!file.startsWith('src/app/')) return false;
  const name = file.slice(file.lastIndexOf('/') + 1).replace(CODE, '').replace(/\.dev$/, '');
  return NEXT_CONVENTIONS.has(name);
}

/** `dm-call`, `DmCall` and `dm_calls` read as one name. */
export function spellingKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/s$/, '');
}

interface Tree {
  files: Set<string>;
  dirs: Set<string>;
}

function treeOf(files: readonly string[]): Tree {
  const dirs = new Set<string>();
  for (const f of files) {
    let d = f.slice(0, f.lastIndexOf('/'));
    while (d.includes('/')) {
      dirs.add(d);
      d = d.slice(0, d.lastIndexOf('/'));
    }
  }
  return { files: new Set(files), dirs };
}

const parent = (p: string) => p.slice(0, p.lastIndexOf('/'));
const base = (p: string) => p.slice(p.lastIndexOf('/') + 1);

/** Every way the given source files break the rules, one line each. */
export function layoutProblems(files: readonly string[]): string[] {
  const code = files.filter((f) => CODE.test(f) && !f.endsWith('.d.ts'));
  const { dirs } = treeOf(code);
  const problems: string[] = [];

  // 1. Nothing loose at a layer's root.
  for (const f of code) {
    if ((LAYERS as readonly string[]).includes(parent(f))) problems.push(`loose at the layer root: ${f}`);
  }

  // 2a. A layer's top-level folders come from the module map or its reasoned list.
  for (const layer of LAYERS) {
    const own = LAYER_ONLY[layer] ?? {};
    for (const d of dirs) {
      if (parent(d) !== layer) continue;
      const name = base(d);
      if (OWN_LIST_ONLY.has(layer) ? !(name in own) : !(MODULES as readonly string[]).includes(name) && !(name in own)) {
        problems.push(`not a module of the map: ${d}`);
      }
    }
  }

  // 2b. One spelling per folder name, across the layers and the shell's route tree.
  const spellings = new Map<string, Set<string>>();
  for (const d of dirs) {
    if (!LAYERS.some((l) => d.startsWith(l + '/')) && !d.startsWith('src/app/[locale]/app/')) continue;
    const name = base(d);
    if (name.startsWith('[') || name.startsWith('(')) continue;
    const key = spellingKey(name);
    if (!spellings.has(key)) spellings.set(key, new Set());
    spellings.get(key)!.add(name);
  }
  for (const [key, names] of spellings) {
    if (names.size > 1 && !(key in ALLOWED_VARIANTS)) {
      problems.push(`one folder name, several spellings: ${[...names].sort().join(', ')}`);
    }
  }

  // 3. A folder with sub-folders keeps only its index or entry loose.
  const withSubfolders = new Set([...dirs].map(parent));
  for (const f of code) {
    const dir = parent(f);
    if (!withSubfolders.has(dir)) continue;
    if (!RULE3_ROOTS.some((r) => dir === r || dir.startsWith(r + '/'))) continue;
    if ((LAYERS as readonly string[]).includes(dir)) continue; // rule 1 already reported it
    const name = base(f);
    if (/^index\.(ts|tsx)$/.test(name) || ENTRY[dir] === name || isNextConvention(f)) continue;
    problems.push(`loose beside sub-folders: ${f}`);
  }

  // 4. Every lib package is a folder with an index.
  for (const d of dirs) {
    if (parent(d) === 'src/lib' && !code.includes(`${d}/index.ts`)) problems.push(`lib package without an index.ts: ${d}`);
  }

  return problems.sort();
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : [relative(ROOT, path).split(sep).join('/')];
  });
}

describe('module layout', () => {
  const files = sourceFiles(join(ROOT, 'src'));
  const { dirs } = treeOf(files);

  it('is looking at the real tree', () => {
    expect(files.length).toBeGreaterThan(1000);
    for (const layer of LAYERS) expect(statSync(join(ROOT, layer)).isDirectory(), layer).toBe(true);
  });

  it('finds every file where the rules put it', () => {
    expect(layoutProblems(files)).toEqual([]);
  });

  it('keeps every reasoned entry still needed, so the lists only shrink', () => {
    for (const [dir, entry] of Object.entries(ENTRY)) {
      expect(files, `${dir}/${entry}`).toContain(`${dir}/${entry}`);
      expect([...dirs].some((d) => parent(d) === dir), `${dir} still has sub-folders`).toBe(true);
    }
    for (const [layer, own] of Object.entries(LAYER_ONLY)) {
      for (const [name, why] of Object.entries(own)) {
        expect(dirs.has(`${layer}/${name}`), `${layer}/${name}`).toBe(true);
        expect(why.length, `${layer}/${name}`).toBeGreaterThan(20);
      }
    }
    for (const name of MODULES) {
      expect(LAYERS.some((l) => dirs.has(`${l}/${name}`)), name).toBe(true);
    }
    expect(Object.keys(ALLOWED_VARIANTS)).toEqual([]);
  });
});

describe('the layout rules', () => {
  const ok = [
    'src/components/chat/dm/thread/DmThreadMenu.tsx',
    'src/hooks/chat/dm/thread/useDmThread.ts',
    'src/services/chat/dm/opt-in.ts',
    'src/lib/nwc/index.ts',
    'src/lib/nwc/uri.ts',
  ];

  it('passes a tree that follows them', () => {
    expect(layoutProblems(ok)).toEqual([]);
  });

  it('bites on a loose file at a layer root', () => {
    expect(layoutProblems([...ok, 'src/hooks/useDismiss.ts'])).toEqual(['loose at the layer root: src/hooks/useDismiss.ts']);
    expect(layoutProblems([...ok, 'src/store/toast.ts'])).toEqual(['loose at the layer root: src/store/toast.ts']);
  });

  it('bites on a top-level folder that is not in the module map', () => {
    expect(layoutProblems([...ok, 'src/hooks/app/useEdgeSwipeOpen.ts'])).toEqual(['not a module of the map: src/hooks/app']);
    expect(layoutProblems([...ok, 'src/services/dm-call/session.ts'])).toEqual(['not a module of the map: src/services/dm-call']);
  });

  it('bites on one folder name spelled two ways', () => {
    expect(layoutProblems([...ok, 'src/utils/chat/DM/pending.ts'])).toEqual(['one folder name, several spellings: DM, dm']);
    expect(layoutProblems([...ok, 'src/hooks/social/notes/useNoteThread.ts', 'src/components/social/note/NoteCard.tsx']))
      .toEqual(['one folder name, several spellings: note, notes']);
    expect(spellingKey('dm-composer')).toBe(spellingKey('DmComposer'));
  });

  it('bites on a loose file beside sub-folders, and allows the index, the entry and route files', () => {
    expect(layoutProblems([...ok, 'src/components/chat/dm/DmUnlock.tsx'])).toEqual([
      'loose beside sub-folders: src/components/chat/dm/DmUnlock.tsx',
    ]);
    expect(layoutProblems([...ok, 'src/components/chat/dm/index.ts'])).toEqual([]);
    expect(layoutProblems([...ok, 'src/components/social/FeedScreen.tsx', 'src/components/social/feed/FeedList.tsx'])).toEqual([]);
    expect(layoutProblems(['src/app/[locale]/app/page.tsx', 'src/app/[locale]/app/AppGate.tsx', 'src/app/[locale]/app/dm/DmList.tsx'])).toEqual([]);
    expect(layoutProblems(['src/app/[locale]/app/Avatar.tsx', 'src/app/[locale]/app/dm/DmList.tsx'])).toEqual([
      'loose beside sub-folders: src/app/[locale]/app/Avatar.tsx',
    ]);
    expect(isNextConvention('src/app/dev/layout.dev.tsx')).toBe(true);
  });

  it('bites on a lib package without an index', () => {
    expect(layoutProblems([...ok, 'src/lib/games/core/types.ts'])).toEqual(['lib package without an index.ts: src/lib/games']);
    expect(layoutProblems([...ok, 'src/lib/nip-59.ts'])).toEqual(['loose at the layer root: src/lib/nip-59.ts']);
  });
});

describe('the assets layer', () => {
  it('bites on a loose asset, an asset kind not on its list, and a file loose beside sub-folders', () => {
    expect(layoutProblems(['src/assets/CloseIcon.tsx'])).toEqual(['loose at the layer root: src/assets/CloseIcon.tsx']);
    expect(layoutProblems(['src/assets/chat/CloseIcon.tsx'])).toEqual(['not a module of the map: src/assets/chat']);
    expect(layoutProblems(['src/assets/icons/CloseIcon.tsx', 'src/assets/illustrations/guides/heroes/RelayHero.tsx'])).toEqual([]);
    expect(layoutProblems(['src/assets/illustrations/Hero.tsx', 'src/assets/illustrations/guides/heroes/RelayHero.tsx'])).toEqual([
      'loose beside sub-folders: src/assets/illustrations/Hero.tsx',
    ]);
  });
});
