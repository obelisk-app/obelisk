import { describe, expect, it } from 'vitest';
import { buildImportGraph, importCycles } from '@tests/support/import-graph';

/**
 * No import cycles in `src/`.
 *
 * Two modules that import each other run in an order that depends on which
 * one something else imported first: one of them sees the other's exports
 * as `undefined` while it initialises. The baseline had none; round 15
 * found one (`mobile/sheets/NewThreadSheet.tsx` <-> `mobile/screens/ForumScreen.tsx`)
 * that the remediation itself had introduced. This keeps the count at zero.
 *
 * The check is the one the re-audit ran: Tarjan's strongly connected
 * components over the static imports of every `.ts`/`.tsx` file in `src/`,
 * type-only imports excluded (the compiler erases them) and `import()`
 * excluded (it runs later, on demand). Every component with more than one
 * file is a cycle.
 */
describe('import cycles in src/', () => {
  const graph = buildImportGraph();

  it('reads the whole tree and resolves every local import', () => {
    expect(graph.files.length).toBeGreaterThan(1000);
    const unresolved = [...graph.staticEdges.values()].flat().filter((to) => to.startsWith('missing:'));
    expect(unresolved).toEqual([]);
  });

  it('finds a cycle when one exists (the detector is not blind)', () => {
    const toy = {
      files: ['a.ts', 'b.ts', 'c.ts', 'd.ts'],
      staticEdges: new Map([['a.ts', ['b.ts']], ['b.ts', ['c.ts']], ['c.ts', ['a.ts']], ['d.ts', ['a.ts']]]),
      dynamicEdges: new Map<string, string[]>(),
    };
    expect(importCycles(toy)).toEqual([['a.ts', 'b.ts', 'c.ts']]);
  });

  it('has none', () => {
    expect(importCycles(graph)).toEqual([]);
  });
});
