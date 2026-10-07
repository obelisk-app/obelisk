import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The owner's rule: hooks live in the hooks layer, `src/hooks/<module>/`, so
 * they can be found and reused. Component folders hold components.
 *
 * So no file under `src/components/` or `src/app/` may
 *   - be a hook file (a file named `useX.ts` or `useX.tsx`), or
 *   - define a hook: a top-level `function useX`, a top-level
 *     `const useX =`, or an `export` of a name `useX` (re-exports included,
 *     so a component folder cannot pose as the place a hook lives).
 * Calling hooks is of course fine; only defining them is not.
 *
 * Round 17 moved about 90 hook files and three inline hooks out of these
 * folders (and the hooks out of `src/services/`).
 */

const ROOT = process.cwd();
const GUARDED = ['src/components', 'src/app'];

const HOOK_FILE = /^use[A-Z][A-Za-z0-9]*\.tsx?$/;
const HOOK_NAME = 'use[A-Z][A-Za-z0-9_$]*';
const DEFINITIONS: ReadonlyArray<RegExp> = [
  // function useX / export function useX / export default function useX / async
  new RegExp(`^(?:export\\s+(?:default\\s+)?)?(?:async\\s+)?function\\s*\\*?\\s*(${HOOK_NAME})\\b`, 'gm'),
  // const useX = / export const useX: T = / let / var
  new RegExp(`^(?:export\\s+)?(?:const|let|var)\\s+(${HOOK_NAME})\\s*[:=]`, 'gm'),
  // export { useX }, export { x as useX }, export { useX } from '...'
  new RegExp(`^export\\s+(?:type\\s+)?\\{[^}]*?\\b(?:as\\s+)?(${HOOK_NAME})\\b[^}]*\\}`, 'gm'),
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|mts|js|jsx|mjs)$/.test(name) ? [path] : [];
  });
}

/** Source with comments blanked out, so a hook named in prose is not a definition. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

/** The hook names a source text defines or exports at the top level. */
export function hooksDefinedIn(source: string): string[] {
  const text = stripComments(source);
  const found = new Set<string>();
  for (const re of DEFINITIONS) {
    for (const match of text.matchAll(re)) {
      // The export-list pattern captures one name; collect every hook in the list.
      if (match[0].startsWith('export') && match[0].includes('{')) {
        for (const name of match[0].matchAll(new RegExp(`\\b(${HOOK_NAME})\\b`, 'g'))) found.add(name[1]);
      } else {
        found.add(match[1]);
      }
    }
  }
  return [...found].sort();
}

function scan(): { hookFiles: string[]; definitions: Map<string, string[]> } {
  const hookFiles: string[] = [];
  const definitions = new Map<string, string[]>();
  for (const dir of GUARDED) {
    for (const path of sourceFiles(join(ROOT, dir))) {
      const file = relative(ROOT, path).split(sep).join('/');
      if (HOOK_FILE.test(basename(path))) hookFiles.push(file);
      const hooks = hooksDefinedIn(readFileSync(path, 'utf8'));
      if (hooks.length > 0) definitions.set(file, hooks);
    }
  }
  return { hookFiles, definitions };
}

describe('the hooks layer', () => {
  const { hookFiles, definitions } = scan();

  it('is looking at folders that exist, and a hooks layer that is in use', () => {
    for (const dir of GUARDED) expect(statSync(join(ROOT, dir)).isDirectory(), dir).toBe(true);
    expect(sourceFiles(join(ROOT, 'src/hooks')).length).toBeGreaterThan(100);
  });

  it('keeps hook files out of src/components and src/app', () => {
    expect(hookFiles).toEqual([]);
  });

  it('keeps hook definitions out of src/components and src/app', () => {
    const offenders = [...definitions].map(([file, hooks]) => `${file}: ${hooks.join(', ')}`);
    expect(offenders).toEqual([]);
  });

  it('sees every form of hook definition, and nothing that only calls or mentions one', () => {
    const source = [
      "import { useState } from 'react';",
      "import { useDismiss } from '@/hooks/common/useDismiss';",
      'export function useAlpha() {}',
      'function useBeta() {}',
      'export default function useGamma() {}',
      'export async function useDelta() {}',
      'const useEpsilon = () => 1;',
      'export const useZeta: () => number = () => 1;',
      'export { useEta, plain, useTheta as useIota };',
      "export { useKappa } from '@/hooks/useKappa';",
      '// function useCommented() {}',
      '/** const useDocumented = 1; */',
      'export default function Panel() {',
      '  const useNative = true;',
      '  function useInner() {}',
      '  useDismiss({ onDismiss: () => {} });',
      '  return useState(0);',
      '}',
      "const url = 'https://example.com/function useNotReal';",
    ].join('\n');
    expect(hooksDefinedIn(source)).toEqual([
      'useAlpha', 'useBeta', 'useDelta', 'useEpsilon', 'useEta', 'useGamma', 'useIota', 'useKappa', 'useTheta', 'useZeta',
    ]);
  });
});
