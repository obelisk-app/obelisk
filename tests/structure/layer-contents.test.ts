import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LAYER_ROOTS, layerProblems } from '../../scripts/layers/analyze';
import { layerFiles, scanLayers } from '../../scripts/layers/scan';

/**
 * What each layer may hold (round 32, docs/ui/conventions.md#what-each-layer-holds),
 * read from the TypeScript syntax tree by `scripts/layers/analyze.ts`:
 *
 *   src/constants/  values and types only: no function, no class, no JSX, and
 *                   no value imported from an app layer
 *   src/hooks/      hooks and their own types: every value it exports is a `use*`
 *   src/utils/      pure functions: no React or Next.js, no import from hooks,
 *                   services, store, components or app, no storage, network or
 *                   timer global
 *   src/services/   business logic and side effects
 *
 * and the one rule for constants in utils, services and hooks: a constant
 * another file reads (a test included) lives in `src/constants/<module>/`; a
 * constant only its own file reads stays there, unexported. So none of those
 * layers exports a constant, and a file of nothing but constants is a
 * constants file in the wrong place.
 *
 * There is no exception list: the tree is clean, and a new problem is fixed
 * where it is, not listed. `npx tsx scripts/layers/scan.ts [folder]` prints
 * what breaks the rule.
 */

const ROOT = process.cwd();
const src = (lines: string[]) => lines.join('\n');

describe('the layers hold what they may', () => {
  it('is looking at the real tree', () => {
    for (const layer of LAYER_ROOTS) expect(statSync(join(ROOT, layer)).isDirectory(), layer).toBe(true);
    const files = layerFiles();
    expect(files.filter((f) => f.startsWith('src/constants/')).length).toBeGreaterThan(100);
    expect(files.filter((f) => f.startsWith('src/hooks/')).length).toBeGreaterThan(300);
  });

  it('finds nothing out of place', () => {
    expect(scanLayers()).toEqual([]);
  });

  it('bites on a real file that breaks its layer', () => {
    const hook = 'src/hooks/chat/composer/useChannelComposer.ts';
    const text = readFileSync(join(ROOT, hook), 'utf8');
    expect(layerProblems(hook, text)).toEqual([]);
    expect(layerProblems(hook, `${text}\nexport const MAX_DRAFTS = 3;\n`)).toEqual([
      expect.stringMatching(/useChannelComposer\.ts:\d+: exports MAX_DRAFTS, which is not a hook$/),
    ]);
    const util = 'src/utils/chat/composer/draft-text.ts';
    expect(layerProblems(util, `${readFileSync(join(ROOT, util), 'utf8')}\nexport const save = (v: string) => localStorage.setItem('k', v);\n`))
      .toEqual([expect.stringMatching(/uses localStorage/)]);
    const constants = 'src/constants/nostr/nip-kinds.ts';
    expect(layerProblems(constants, `${readFileSync(join(ROOT, constants), 'utf8')}\nexport const isKind = (k: number) => k > 0;\n`))
      .toEqual([expect.stringMatching(/a function or class in a constants file/)]);
  });
});

describe('the rule, case by case', () => {
  it('hooks export hooks and types, nothing else', () => {
    const file = 'src/hooks/chat/x/useThing.ts';
    expect(layerProblems(file, src([
      "import { useState } from 'react';",
      'export type Thing = { a: number };',
      'export interface ThingProps { b: string }',
      'const LIMIT = 3;',
      'function helper(n: number) { return n * LIMIT; }',
      'export function useThing() { return useState(helper(1)); }',
      'export const useOther = () => 1;',
      'export default function useDefault() { return 1; }',
    ]))).toEqual([]);
    expect(layerProblems(file, src([
      'export const PRESENCE_WINDOW_MS = 1000;',
      'export function slashQueryOf(s: string) { return s; }',
      'export function Nip46SignerDeepLink(): null { return null; }',
      "export { relayKey } from '@/utils/settings/social-relays';",
      "export * from './types';",
    ])).map((p) => p.replace(/^.*?: /, ''))).toEqual([
      'exports PRESENCE_WINDOW_MS, which is not a hook',
      'exports slashQueryOf, which is not a hook',
      'exports Nip46SignerDeepLink, which is not a hook',
      'exports relayKey, which is not a hook',
      'exports *, which is not a hook',
    ]);
  });

  it('utils are pure: no React, no app layer with state or effects, no storage, network or timers', () => {
    const file = 'src/utils/chat/x/helpers.ts';
    expect(layerProblems(file, src([
      "import type { ReactNode } from 'react';",
      "import type { JsGroup } from '@/services/nostr-bridge';",
      "import { MAX } from '@/constants/chat/x';",
      "import { nip19 } from 'nostr-tools';",
      'export function clamp(n: number, fetch: (u: string) => void) { fetch(String(n)); return Math.min(n, MAX); }',
      'export const label = (g: JsGroup): ReactNode => g.name;',
    ]))).toEqual([]);
    expect(layerProblems(file, src([
      "import { useState } from 'react';",
      "import { useRouter } from 'next/navigation';",
      "import { getBridge } from '@/services/nostr-bridge';",
      "import { useChatStore } from '@/store/chat';",
      'export function a() { return localStorage.getItem("k"); }',
      'export function b() { return window.setTimeout(() => {}, 1); }',
      'export async function c() { return fetch("/x"); }',
      'export function d() { requestAnimationFrame(() => {}); }',
    ])).map((p) => p.replace(/^.*?: /, ''))).toEqual([
      'imports react: a helper in utils is pure',
      'imports next/navigation: a helper in utils is pure',
      'imports @/services/nostr-bridge: a helper in utils is pure',
      'imports @/store/chat: a helper in utils is pure',
      'uses localStorage: storage, network and timers belong in services',
      'uses setTimeout: storage, network and timers belong in services',
      'uses fetch: storage, network and timers belong in services',
      'uses requestAnimationFrame: storage, network and timers belong in services',
    ]);
    expect(layerProblems('src/utils/x/y.tsx', 'export const row = () => <div />;')).toEqual([
      'src/utils/x/y.tsx:1: JSX in utils: a component belongs in src/components/',
    ]);
  });

  it('constants hold values and types: no function, class or JSX, no value from an app layer', () => {
    const file = 'src/constants/chat/x.ts';
    expect(layerProblems(file, src([
      "import type { MessageKey } from '@/i18n/keys';",
      "import type { JsGroup } from '@/services/nostr-bridge';",
      "import { KIND_GAME } from '@/constants/nostr/nip-kinds';",
      "import { GARBAGE_CELL } from '@/lib/games/stacker/engine';",
      "import { kinds } from 'nostr-tools';",
      'export const MAX_ROWS = 5 * 60_000;',
      "export const OPTIONS: ReadonlyArray<{ key: MessageKey }> = [{ key: 'chat.x' }];",
      'export const KINDS = new Set([KIND_GAME, GARBAGE_CELL, kinds.Metadata]);',
      'export type Group = JsGroup;',
    ]))).toEqual([]);
    expect(layerProblems('src/constants/chat/x.tsx', src([
      "import { getBridge } from '@/services/nostr-bridge';",
      'export const pick = (n: number) => n;',
      'export function f() {}',
      'export class Thing {}',
      'export const ICONS = [<span key="a" />];',
      'export const SORT = { by: function () { return 1; } };',
    ])).map((p) => p.replace(/^.*?: /, ''))).toEqual([
      'a function or class in a constants file',
      'a function or class in a constants file',
      'a function or class in a constants file',
      'JSX in a constants file',
      'a function or class in a constants file',
      'a value imported from an app layer (@/services/nostr-bridge): a constant reads only other constants and lib packages',
    ]);
  });

  it('services and utils export no constant, and a file of nothing but constants is in the wrong layer', () => {
    const file = 'src/services/voice/x.ts';
    expect(layerProblems(file, src([
      "import { CACHE_ENTRIES } from './inventory-cache';",
      "import { MAX } from '@/constants/voice/x';",
      'const PRIVATE_LIMIT = 3;',
      'export const hub = createHub();',
      'export const statuses = new Map<string, number>();',
      'export const bag: { on?: () => void } = {};',
      'export const LIST = [...CACHE_ENTRIES];',
      'export const pick = () => MAX + PRIVATE_LIMIT;',
      'function createHub() { return {}; }',
    ]))).toEqual([]);
    expect(layerProblems(file, src([
      'export const RETRY_MS = 5_000;',
      'export const GIPHY_KEY = process.env.NEXT_PUBLIC_GIPHY_API_KEY;',
      'export function retry() { return RETRY_MS; }',
    ])).map((p) => p.replace(/^.*?: /, ''))).toEqual([
      'exports the constant RETRY_MS: it belongs in src/constants/ (or unexported, if only this file reads it)',
      'exports the constant GIPHY_KEY: it belongs in src/constants/ (or unexported, if only this file reads it)',
    ]);
    expect(layerProblems('src/utils/nostr/kinds.ts', src([
      '/** Kinds. */',
      'export const KIND_A = 1;',
      'export const KIND_B = 2;',
      'export type Kind = 1 | 2;',
    ]))).toEqual(['src/utils/nostr/kinds.ts:2: only constants: the file belongs in src/constants/']);
  });
});


describe('shared types and runtime schemas', () => {
  it('keeps runtime values out of type contracts', () => {
    expect(layerProblems('src/types/common/data.ts', "import type { ReactNode } from 'react'; export interface Row { content: ReactNode }")).toEqual([]);
    expect(layerProblems('src/types/common/data.ts', 'export const LIMIT = 10;')).toEqual([
      expect.stringContaining('runtime code in types'),
    ]);
    expect(layerProblems('src/types/common/data.ts', "import { useState } from 'react'; export type Row = string;")).toEqual([
      expect.stringContaining('runtime code in types'),
    ]);
  });

  it('keeps runtime schemas independent of state and network services', () => {
    expect(layerProblems('src/schemas/common/data.ts', 'export function isText(value: unknown): value is string { return typeof value === "string"; }')).toEqual([]);
    expect(layerProblems('src/schemas/common/data.ts', 'export async function parse() { return fetch("/data"); }')).toEqual([
      expect.stringContaining('uses fetch'),
    ]);
  });

  it('detects formatted literal collections exported as constants from utils', () => {
    expect(layerProblems('src/utils/nostr/permissions.ts', "export const PERMISSIONS = ['nip04_encrypt', ...[1, 2].map((nip) => 'nip:' + nip)].join(',');")).toEqual([
      expect.stringContaining('exports the constant PERMISSIONS'),
    ]);
  });
});
