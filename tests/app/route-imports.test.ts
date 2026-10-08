import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildImportGraph, type ImportGraph } from '@tests/support/import-graph';

/**
 * Next.js refuses `react-dom/server` in anything an App Router module
 * imports ("You're importing a component that imports react-dom/server"),
 * and only `next build` says so. This reads the import graph from every file
 * under `src/app/` (pages, layouts, route handlers, the live preview-card
 * route), static and dynamic edges alike, and fails on any reachable file
 * that imports it. Code that needs it (the static cards' fingerprint,
 * `src/services/server/og/fingerprint.ts`) is reachable only from
 * `scripts/` and tests.
 */
const SERVER_RENDERER = /(?:from\s+|import\s+|import\s*\(\s*|require\s*\(\s*)['"]react-dom\/server(?:\.[\w.]+)?['"]/;

function reachable(graph: ImportGraph, starts: string[]): Map<string, string> {
  const via = new Map<string, string>(starts.map((s) => [s, s]));
  const queue = [...starts];
  while (queue.length > 0) {
    const file = queue.shift()!;
    for (const next of [...(graph.staticEdges.get(file) ?? []), ...(graph.dynamicEdges.get(file) ?? [])]) {
      if (!graph.staticEdges.has(next) || via.has(next)) continue;
      via.set(next, via.get(file)!);
      queue.push(next);
    }
  }
  return via;
}

function serverRendererUsers(graph: ImportGraph, starts: string[]): string[] {
  return [...reachable(graph, starts)]
    .filter(([file]) => SERVER_RENDERER.test(readFileSync(file, 'utf8')))
    .map(([file, from]) => `${file} (reached from ${from})`);
}

describe('App Router modules never reach react-dom/server', () => {
  const graph = buildImportGraph();

  it('from any page, layout or route handler under src/app', () => {
    const routes = graph.files.filter((f) => f.startsWith('src/app/'));
    expect(routes).toContain('src/app/[locale]/og/[kind]/[id]/route.ts');
    expect(serverRendererUsers(graph, routes)).toEqual([]);
  });

  it('bites: the snap-og work does reach it, through the fingerprint', () => {
    expect(serverRendererUsers(graph, ['src/services/server/og/snap.ts'])).toEqual([
      'src/services/server/og/fingerprint.ts (reached from src/services/server/og/snap.ts)',
    ]);
  });
});
