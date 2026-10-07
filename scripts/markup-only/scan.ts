/**
 * Walk the component folders and run the markup-only analysis on every
 * component file (`analyze.ts`). Shared by the guard test
 * (`tests/components/markup-only.test.ts`) and the baseline script.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { analyzeSource, KINDS, type Counts, type Finding } from './analyze';
import { MULTI_COMPONENT } from './multi-component';

export const GUARDED = ['src/components', 'src/app', 'src/assets'];
/** Where the shrink-only baseline lives; regenerate it with `npx tsx scripts/markup-only/baseline.ts`. */
export const BASELINE_PATH = 'tests/components/markup-only-baseline.json';

/** `.ts` files Next.js finds by name in `src/app`: route handlers and metadata routes. */
const NEXT_TS = /(^|\/)(route|sitemap|robots|manifest)\.ts$/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return [path];
  });
}

/** Every file the rule covers: `.tsx` under the guarded folders, plus the Next.js `.ts` route files. */
export function guardedFiles(root = process.cwd()): string[] {
  return GUARDED.flatMap((dir) => files(join(root, dir)))
    .map((path) => relative(root, path).split(sep).join('/'))
    .filter((file) => file.endsWith('.tsx') || (file.startsWith('src/app/') && NEXT_TS.test(file)))
    .sort();
}

export interface ScanEntry { counts: Counts; findings: Finding[] }

/** Findings per file, with the reasoned multi-component files' extra components forgiven. Files with none are left out. */
export function scanTree(root = process.cwd()): Record<string, ScanEntry> {
  const out: Record<string, ScanEntry> = {};
  for (const file of guardedFiles(root)) {
    const report = analyzeSource(readFileSync(join(root, file), 'utf8'), file);
    let findings = report.findings;
    if (file in MULTI_COMPONENT) findings = findings.filter((f) => f.kind !== 'components');
    if (findings.length === 0) continue;
    const counts: Counts = {};
    for (const f of findings) counts[f.kind] = (counts[f.kind] ?? 0) + 1;
    out[file] = { counts, findings };
  }
  return out;
}

/** The baseline shape: file -> kind -> count, kinds in a fixed order. */
export function countsByFile(tree: Record<string, ScanEntry>): Record<string, Counts> {
  const out: Record<string, Counts> = {};
  for (const file of Object.keys(tree).sort()) {
    const ordered: Counts = {};
    for (const k of KINDS) if (tree[file].counts[k]) ordered[k] = tree[file].counts[k];
    out[file] = ordered;
  }
  return out;
}
