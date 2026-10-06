import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';

/**
 * A small import graph of `src/`, read from the source text.
 *
 * Two edge kinds matter to the guards that use it:
 *
 * - a **static** edge is an `import ... from` or `export ... from` that
 *   survives compilation. It runs when the importing module runs, so a loop
 *   of static edges is an import cycle, and everything reachable over static
 *   edges ships in the same download as the module it starts from;
 * - a **dynamic** edge is `import('...')` (what `next/dynamic` and
 *   `React.lazy` take). It is a separate download fetched when called.
 *
 * Type-only imports are left out: the compiler erases them, so they create
 * neither a cycle nor a download. That covers `import type`, `export type`
 * and a braces list in which every name is marked `type`.
 *
 * A bare specifier (`mediasoup-client`, `vesta/src/x`) becomes a node named
 * `pkg:<package name>` with no edges of its own.
 */

export type ImportGraph = {
  /** Every source file, as a path relative to the repo root. */
  files: string[];
  staticEdges: Map<string, string[]>;
  dynamicEdges: Map<string, string[]>;
};

const ROOT = resolve(__dirname, '..', '..');
const SRC = join(ROOT, 'src');
const EXTENSIONS = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

/** `import x from`, `import { a, type B } from`, `export { a } from`, `export * from`. */
const FROM_STATEMENT = /^[ \t]*(import|export)\s+(type\s+)?([\w*{}\s,$]+?)\s+from\s+['"]([^'"]+)['"]/gm;
const SIDE_EFFECT = /^[ \t]*import\s+['"]([^'"]+)['"]/gm;
const DYNAMIC = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name) && !name.endsWith('.d.ts')) out.push(full);
  }
}

/** True when every name in `{ type A, type B }` is a type. */
function onlyTypes(clause: string): boolean {
  const braces = clause.match(/^\{([\s\S]*)\}$/);
  if (!braces) return false;
  const names = braces[1].split(',').map((s) => s.trim()).filter(Boolean);
  return names.length > 0 && names.every((n) => n.startsWith('type '));
}

function packageName(spec: string): string {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function resolveSpec(fromFile: string, spec: string): string {
  let base: string;
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec);
  else return `pkg:${packageName(spec)}`;
  if (/\.(tsx?|css|json|svg|png)$/.test(base) && existsSync(base)) return relative(ROOT, base);
  for (const ext of EXTENSIONS) {
    if (existsSync(base + ext)) return relative(ROOT, base + ext);
  }
  return `missing:${relative(ROOT, base)}`;
}

export function buildImportGraph(): ImportGraph {
  const absolute: string[] = [];
  walk(SRC, absolute);
  const staticEdges = new Map<string, string[]>();
  const dynamicEdges = new Map<string, string[]>();
  for (const file of absolute) {
    const source = readFileSync(file, 'utf8');
    const statics = new Set<string>();
    const dynamics = new Set<string>();
    for (const m of source.matchAll(FROM_STATEMENT)) {
      const [, , typeKeyword, clause, spec] = m;
      if (typeKeyword || onlyTypes(clause.trim())) continue;
      statics.add(resolveSpec(file, spec));
    }
    for (const m of source.matchAll(SIDE_EFFECT)) statics.add(resolveSpec(file, m[1]));
    for (const m of source.matchAll(DYNAMIC)) dynamics.add(resolveSpec(file, m[1]));
    const key = relative(ROOT, file);
    staticEdges.set(key, [...statics]);
    dynamicEdges.set(key, [...dynamics]);
  }
  return { files: absolute.map((f) => relative(ROOT, f)), staticEdges, dynamicEdges };
}

/**
 * Strongly connected components with more than one file, plus any file that
 * imports itself (Tarjan's algorithm, iterative so a deep tree cannot
 * overflow the stack). Each one is an import cycle.
 */
export function importCycles(graph: ImportGraph): string[][] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  let counter = 0;
  const next = (n: string) => (graph.staticEdges.get(n) ?? []).filter((m) => graph.staticEdges.has(m));

  for (const start of graph.files) {
    if (index.has(start)) continue;
    const work: Array<{ node: string; i: number }> = [{ node: start, i: 0 }];
    index.set(start, counter); low.set(start, counter); counter += 1;
    stack.push(start); onStack.add(start);
    while (work.length > 0) {
      const frame = work[work.length - 1];
      const edges = next(frame.node);
      if (frame.i < edges.length) {
        const to = edges[frame.i];
        frame.i += 1;
        if (!index.has(to)) {
          index.set(to, counter); low.set(to, counter); counter += 1;
          stack.push(to); onStack.add(to);
          work.push({ node: to, i: 0 });
        } else if (onStack.has(to)) {
          low.set(frame.node, Math.min(low.get(frame.node)!, index.get(to)!));
        }
        continue;
      }
      work.pop();
      if (work.length > 0) {
        const parent = work[work.length - 1].node;
        low.set(parent, Math.min(low.get(parent)!, low.get(frame.node)!));
      }
      if (low.get(frame.node) === index.get(frame.node)) {
        const component: string[] = [];
        let member: string;
        do {
          member = stack.pop()!;
          onStack.delete(member);
          component.push(member);
        } while (member !== frame.node);
        const selfLoop = component.length === 1 && edges.includes(frame.node);
        if (component.length > 1 || selfLoop) cycles.push(component.sort());
      }
    }
  }
  return cycles;
}

/** Everything `entry` pulls in over static edges, itself included. */
export function staticClosure(graph: ImportGraph, entry: string): Set<string> {
  const seen = new Set<string>([entry]);
  const queue = [entry];
  while (queue.length > 0) {
    const node = queue.pop()!;
    for (const to of graph.staticEdges.get(node) ?? []) {
      if (seen.has(to)) continue;
      seen.add(to);
      queue.push(to);
    }
  }
  return seen;
}

/** One static import chain from `entry` to `target`, or null when none exists. */
export function staticPath(graph: ImportGraph, entry: string, target: string): string[] | null {
  const parent = new Map<string, string | null>([[entry, null]]);
  const queue = [entry];
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (node === target) {
      const path: string[] = [];
      for (let at: string | null = node; at !== null; at = parent.get(at) ?? null) path.unshift(at);
      return path;
    }
    for (const to of graph.staticEdges.get(node) ?? []) {
      if (parent.has(to)) continue;
      parent.set(to, node);
      queue.push(to);
    }
  }
  return null;
}
