/**
 * Run the layer-contents rule (`analyze.ts`) over the tree. Shared by the
 * guard (`tests/structure/layer-contents.test.ts`) and, from the command
 * line, a list of what breaks it: `npx tsx scripts/layers/scan.ts [folder]`.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { LAYER_ROOTS, layerProblems } from './analyze';

function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

/** Every source file under the guarded layers, as repo-relative paths. */
export function layerFiles(root = process.cwd()): string[] {
  return LAYER_ROOTS.flatMap((dir) => files(join(root, dir)))
    .map((path) => relative(root, path).split(sep).join('/'))
    .sort();
}

/** Every problem in the tree, one line each (`file:line: what`). */
export function scanLayers(root = process.cwd(), only?: string): string[] {
  return layerFiles(root)
    .filter((file) => !only || file.startsWith(only))
    .flatMap((file) => layerProblems(file, readFileSync(join(root, file), 'utf8')));
}

if (process.argv[1]?.endsWith('scan.ts')) {
  const problems = scanLayers(process.cwd(), process.argv[2]);
  for (const p of problems) console.log(p);
  console.log(`${problems.length} problem(s)`);
}
