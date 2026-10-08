import ts from 'typescript';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MODULES, SCOPES, scopeMessages, type Module, type Scope } from '@/i18n/modules';
import { buildImportGraph } from '@tests/support/import-graph';

/**
 * Each route hands the browser only the message modules in its
 * `<IntlScope scope="...">` (`SCOPES` in src/i18n/modules.ts). A client
 * component that reads a key from a module its route did not ship renders
 * the raw key, and nothing else would notice until someone opened that page
 * in that language.
 *
 * So: for every route file under `src/app/[locale]`, find the nearest scope
 * (declared in the file itself or in a layout above it), walk client boundaries and every module
 * those clients can load (static and dynamic imports), and require each message
 * module those files name to be in the scope. `seo` is exempt: it is read
 * on the server through `getTranslations` and never shipped.
 */

const ROUTE_FILE = /\/(page|layout|error|not-found|template|default)\.tsx$/;
const SCOPE_DECL = /<IntlScope scope="(\w+)"/;
const LOCALE_ROOT = 'src/app/[locale]';

function files(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else out.push(p);
  }
  return out;
}

/** The scope a route file renders under: its own, else the nearest layout's. */
function scopeOf(file: string): Scope | null {
  const own = readFileSync(file, 'utf8').match(SCOPE_DECL);
  if (own) return own[1] as Scope;
  for (let dir = dirname(file); dir.startsWith(LOCALE_ROOT); dir = dirname(dir)) {
    const layout = join(dir, 'layout.tsx');
    if (layout === file) continue;
    try {
      const found = readFileSync(layout, 'utf8').match(SCOPE_DECL);
      if (found) return found[1] as Scope;
    } catch { /* no layout at this level */ }
  }
  return null;
}

const MODULE_KEY = new RegExp(`^(${MODULES.join('|')})\\.`);
const clientKeys = new Map<string, string[]>();

/** Comments and example snippets are not translation reads. Keep template prefixes. */
function messagePaths(file: string): string[] {
  const cached = clientKeys.get(file);
  if (cached) return cached;
  const keys = new Set<string>();
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  function visit(node: ts.Node) {
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node)) {
      if (MODULE_KEY.test(node.text)) keys.add(node.text.replace(/\.$/, ''));
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  const paths = [...keys];
  clientKeys.set(file, paths);
  return paths;
}

function modulesNamedIn(file: string): Set<Module> {
  return new Set(messagePaths(file).map((path) => path.split('.')[0] as Module));
}

function messageAt(tree: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, tree);
}

describe('route message scopes', () => {
  const graph = buildImportGraph();

  function reachable(entry: string): string[] {
    const seen = new Set<string>();
    const clients = new Set<string>();
    const queue: Array<[string, boolean]> = [[entry, false]];
    while (queue.length) {
      const [f, inheritedClient] = queue.pop()!;
      const client = inheritedClient || /^['"]use client['"];?/m.test(readFileSync(f, 'utf8'));
      const key = `${f}:${client}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (client) clients.add(f);
      for (const next of [...(graph.staticEdges.get(f) ?? []), ...(graph.dynamicEdges.get(f) ?? [])]) {
        if (graph.staticEdges.has(next)) queue.push([next, client]);
      }
    }
    return [...clients];
  }

  const routes = files(LOCALE_ROOT).filter((f) => ROUTE_FILE.test(f));

  it('every route under [locale] renders inside a scope', () => {
    expect(routes.length).toBeGreaterThan(15);
    expect(routes.filter((r) => scopeOf(r) === null)).toEqual([]);
  });

  it('no client file reachable from a route names a module that route does not ship', () => {
    const problems: string[] = [];
    for (const route of routes) {
      const scope = scopeOf(route);
      if (!scope) continue;
      const allowed = new Set<Module>([...SCOPES[scope], 'seo']);
      // src/i18n names modules in its own docs and lists; it reads no copy.
      for (const file of reachable(route).filter((f) => !f.startsWith('src/i18n/'))) {
        for (const m of modulesNamedIn(file)) {
          if (!allowed.has(m)) problems.push(`${route} (${scope}) reaches ${file}, which reads "${m}"`);
        }
      }
    }
    expect([...new Set(problems)]).toEqual([]);
  });

  it('ships every literal client message subtree used by each route', () => {
    const messages = Object.fromEntries(MODULES.map((module) => [module, JSON.parse(readFileSync(`src/i18n/messages/en/${module}.json`, 'utf8'))]));
    const problems: string[] = [];
    for (const route of routes) {
      const scope = scopeOf(route);
      if (!scope) continue;
      const selected = scopeMessages(messages, scope);
      for (const file of reachable(route).filter((f) => !f.startsWith('src/i18n/'))) {
        for (const path of messagePaths(file)) {
          if (!path.startsWith('seo.') && messageAt(messages, path) !== undefined && messageAt(selected, path) === undefined) {
            problems.push(`${route} (${scope}) reaches ${file}, which reads "${path}"`);
          }
        }
      }
    }
    expect([...new Set(problems)]).toEqual([]);
  });

  it('declares each scope only once along a route ancestry', () => {
    for (const route of routes) {
      const declared = readFileSync(route, 'utf8').match(SCOPE_DECL)?.[1];
      if (!declared) continue;
      for (let dir = dirname(route); dir.startsWith(LOCALE_ROOT); dir = dirname(dir)) {
        const layout = join(dir, 'layout.tsx');
        if (layout === route) continue;
        let source = '';
        try { source = readFileSync(layout, 'utf8'); } catch { continue; }
        expect(source.match(SCOPE_DECL)?.[1], route).not.toBe(declared);
      }
    }
  });

  it('uses a layout for a scope-only wrapper only when it serves multiple pages', () => {
    for (const layout of routes.filter((file) => file.endsWith('/layout.tsx'))) {
      if (!/return\s+(?:\(\s*)?<IntlScope scope="\w+">\{children\}<\/IntlScope>/.test(readFileSync(layout, 'utf8'))) continue;
      const pages = files(dirname(layout)).filter((file) => file.endsWith('/page.tsx'));
      expect(pages.length, layout).toBeGreaterThan(1);
    }
  });

  it('keeps the chat and app modules off the landing page', () => {
    expect(SCOPES.public).not.toContain('chat');
    expect(SCOPES.public).not.toContain('shell');
    expect(scopeOf(`${LOCALE_ROOT}/page.tsx`)).toBe('public');
  });

  it('never ships the server-only seo module', () => {
    for (const modules of Object.values(SCOPES)) expect(modules).not.toContain('seo');
  });
});
