import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * The owner's rule: component folders hold components only. Code is placed
 * by what it is:
 *   - `src/lib/`: self-contained mini-packages that could be published alone;
 *   - `src/utils/<topic>/`: small, stateless helpers (pure feature helpers too);
 *   - `src/services/`: business logic and anything that talks to the outside
 *     world (relays, fetch, storage, the clipboard, stores);
 *   - `src/hooks/`: hooks (guarded by `tests/hooks/hooks-layer.test.ts`).
 *
 * So every module under `src/components/` and `src/app/` must be a
 * component module: a `.tsx` file that renders JSX or exports a component
 * (a PascalCase function, including the render-nothing roots such as
 * `GuideLocaleSync` and the barrels that re-export components). A `.ts`
 * file there cannot be one, so it is logic in the wrong folder; a `.tsx`
 * file with no JSX and no component export is the same thing wearing a
 * component's extension. The exceptions are the Next.js file conventions (a
 * `route.ts` or a `sitemap.ts` has to live in `src/app/`) and the list
 * below, each entry with its reason.
 *
 * Round 18 moved about 70 modules out of these folders (see
 * audits/obelisk/round18/logic.md).
 */

const ROOT = process.cwd();
const GUARDED = ['src/components', 'src/app'];

/** Files Next.js finds by name; they live where the router wants them. */
const NEXT_CONVENTIONS = new Set([
  'route', 'page', 'layout', 'loading', 'error', 'global-error', 'not-found', 'template', 'default',
  'sitemap', 'robots', 'manifest', 'opengraph-image', 'twitter-image', 'icon', 'apple-icon',
]);

const GAMES_BRANCH = 'owned by another branch in round 18 (on-demand loading of the games registry and game components); move it once that lands';

/**
 * Non-component modules allowed to stay, and why. Shrink-only: an entry that
 * gets moved (or turns into a component) fails the "still needed" test until
 * it is deleted here, and `ALLOWED_CEILING` only ever goes down.
 */
const ALLOWED: Readonly<Record<string, string>> = {
  'src/components/ui/input-surface.ts':
    "the ui kit's own variant table: the Tailwind class strings Input and TextArea share; pure style data, private to the kit (nothing outside src/components/ui imports it)",
  'src/components/ui/merge-refs.ts':
    "a private building block of the ui kit: only the Input and TextArea primitives use it; it moves to src/utils the day anything outside the kit needs it",
  'src/components/chat/games/chain-reaction/cascade.ts': GAMES_BRANCH,
  'src/components/chat/games/chain-reaction/css-vars.ts': GAMES_BRANCH,
  'src/components/chat/games/chain-reaction/seat-colors.ts': GAMES_BRANCH,
  'src/components/chat/games/new-game/game-options.ts': GAMES_BRANCH,
  'src/components/chat/games/results-rows.ts': GAMES_BRANCH,
  'src/components/chat/games/stacker/block-paint.ts': GAMES_BRANCH,
  'src/components/chat/games/stacker/draw-well.ts': GAMES_BRANCH,
  'src/components/chat/games/stacker/piece-colors.ts': GAMES_BRANCH,
  'src/components/chat/games/vesta/board-pick.ts': GAMES_BRANCH,
  'src/components/chat/games/vesta/draw-board.ts': GAMES_BRANCH,
  'src/components/chat/games/vesta/palette.ts': GAMES_BRANCH,
  'src/components/chat/games/vesta/pick-mode.ts': GAMES_BRANCH,
  'src/components/chat/games/vesta/resources.ts': GAMES_BRANCH,
};

/** Lower this when an entry leaves `ALLOWED`; never raise it. */
const ALLOWED_CEILING = 15;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|mts|js|jsx|mjs)$/.test(name) && !name.endsWith('.d.ts') ? [path] : [];
  });
}

/** True when the source holds at least one JSX element or fragment. */
export function containsJsx(source: string, fileName = 'module.tsx'): boolean {
  // A `.ts` file cannot hold JSX: parse it as TS so `<T>value` reads as a cast.
  const kind = /\.(tsx|jsx)$/.test(fileName) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, false, kind);
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/** `Panel`, `MenuItem`; not `LIMIT` or `MAX_ROWS`, which are constants. */
const PASCAL = /^[A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*$/;

/**
 * True when the module exports a PascalCase value: `export function Panel`,
 * `export default function Panel`, `export const Panel = ...`,
 * `export default Panel`, or `export { Panel } from './Panel'`.
 * Exported types and interfaces do not count.
 */
export function exportsComponent(source: string, fileName = 'module.tsx'): boolean {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX);
  const exported = (node: ts.Node) =>
    ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  for (const node of file.statements) {
    if (ts.isFunctionDeclaration(node) && exported(node)) {
      const isDefault = (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
      if (isDefault || (node.name && PASCAL.test(node.name.text))) return true;
    }
    if (ts.isVariableStatement(node) && exported(node)) {
      if (node.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && PASCAL.test(d.name.text))) return true;
    }
    if (ts.isExportAssignment(node) && ts.isIdentifier(node.expression) && PASCAL.test(node.expression.text)) return true;
    if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.exportClause && ts.isNamedExports(node.exportClause)) {
      if (node.exportClause.elements.some((e) => !e.isTypeOnly && PASCAL.test(e.name.text))) return true;
    }
  }
  return false;
}

/** A `.tsx` file that renders or exports a component; never a `.ts` file. */
export function isComponentModule(source: string, fileName: string): boolean {
  if (!/\.(tsx|jsx)$/.test(fileName)) return false;
  return containsJsx(source, fileName) || exportsComponent(source, fileName);
}

function isNextConvention(file: string): boolean {
  if (!file.startsWith('src/app/')) return false;
  return NEXT_CONVENTIONS.has(basename(file).replace(/\.(ts|tsx|js|jsx|mjs|mts)$/, ''));
}

/** Every module under the guarded folders that renders nothing and is not a Next.js convention file. */
function nonComponentModules(): string[] {
  const out: string[] = [];
  for (const dir of GUARDED) {
    for (const path of sourceFiles(join(ROOT, dir))) {
      const file = relative(ROOT, path).split(sep).join('/');
      if (isNextConvention(file)) continue;
      if (!isComponentModule(readFileSync(path, 'utf8'), file)) out.push(file);
    }
  }
  return out.sort();
}

describe('component folders hold components only', () => {
  const found = nonComponentModules();

  it('is looking at folders that exist and are full of components', () => {
    for (const dir of GUARDED) expect(statSync(join(ROOT, dir)).isDirectory(), dir).toBe(true);
    expect(sourceFiles(join(ROOT, 'src/components')).length).toBeGreaterThan(300);
  });

  it('has no logic module under src/components or src/app outside the reasoned list', () => {
    expect(found.filter((file) => !(file in ALLOWED))).toEqual([]);
  });

  it('keeps every listed exception still needed, so the list only shrinks', () => {
    const stale = Object.keys(ALLOWED).filter((file) => !found.includes(file));
    expect(stale).toEqual([]);
    expect(Object.keys(ALLOWED).length).toBeLessThanOrEqual(ALLOWED_CEILING);
    for (const reason of Object.values(ALLOWED)) expect(reason.length).toBeGreaterThan(20);
  });

  it('knows a component from a helper, and a generic from an element', () => {
    expect(containsJsx('export const A = () => <div />;')).toBe(true);
    expect(containsJsx('export function B() { return <><span>x</span></>; }')).toBe(true);
    expect(containsJsx('export const icons = { x: <svg viewBox="0 0 1 1" /> };')).toBe(true);
    expect(containsJsx('export function f<T,>(x: T) { return useState<string>(String(x)); }')).toBe(false);
    expect(containsJsx('export const n = <number>value;', 'helper.ts')).toBe(false);
    expect(containsJsx("export const s = '<div>not jsx</div>'; // <b>nor this</b>")).toBe(false);
    expect(exportsComponent('export default function Root() { useEffect(() => {}, []); return null; }')).toBe(true);
    expect(exportsComponent("export { Panel } from './Panel';")).toBe(true);
    expect(exportsComponent('export const Row = memo(function Row() { return null; });')).toBe(true);
    expect(exportsComponent("export function buildRows() { return []; }\nexport type Rows = string[];")).toBe(false);
    expect(exportsComponent("export { type Props, helper } from './x';\nexport const LIMIT = 4;")).toBe(false);
    expect(isComponentModule('export default function Root() { return null; }', 'src/components/Root.tsx')).toBe(true);
    expect(isComponentModule('export default function Root() { return null; }', 'src/components/root.ts')).toBe(false);
    expect(isNextConvention('src/app/robots.ts')).toBe(true);
    expect(isNextConvention('src/app/[locale]/guides/[slug]/opengraph-image.tsx')).toBe(true);
    expect(isNextConvention('src/app/[locale]/app/feed-pane.ts')).toBe(false);
    expect(isNextConvention('src/components/chat/page.ts')).toBe(false);
  });
});
