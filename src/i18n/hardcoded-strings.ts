/**
 * Finds user-visible text that never reaches a message file.
 *
 * The key types catch the forward direction (every key the code asks for
 * exists). This is the inverse: copy written straight into the source is
 * English in the Spanish build too, and no amount of translating touches it.
 *
 * Exported as a module rather than living inside the test because the
 * baseline is generated from it (`npx tsx scripts/i18n/hardcoded-baseline.ts`).
 *
 * ## What is scanned
 *
 * `src/**` `.ts` and `.tsx`, minus tests, `.d.ts`, `src/i18n` (the
 * scanner and the messages), `src/app/api` (JSON for machines),
 * `src/app/dev` and its fixtures in `src/utils/games/shots` (never shipped). Comments are stripped first. The rules
 * are listed in `hardcoded/rules.ts`; `src/lib` gets only the "no prose in
 * a mini-package" rule, because lib exports codes the app translates.
 *
 * ## Legitimate exceptions
 *
 * A line carrying `i18n-exempt: <reason>` (in any comment on that line) is
 * not reported: brand names, protocol terms, endonyms, artwork text that
 * feeds the OG snapshots. The reason is mandatory, so the exemption reads
 * as a decision rather than a suppression.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { looksLikeProse } from './hardcoded/prose';
import { stripComments } from './hardcoded/strip';
import { candidates } from './hardcoded/rules';

export { looksLikeProse };

/** Files that are not shipped UI. */
const SKIP_FILE = /\.(test|spec)\.[tj]sx?$|\.d\.ts$|\.dev\.tsx$|^(?:test-support|fake-[\w-]+)\.ts$/;
/** Folders that are not shipped UI, relative to `src`. */
const SKIP_DIR = /^(?:i18n|app\/api|app\/dev|utils\/games\/shots)(?:\/|$)/;
/** The per-line marker; a reason after the colon is required. */
export const EXEMPT = /i18n-exempt:\s*[A-Za-z]/;

export type Finding = {
  /** Path relative to `src`. */
  readonly file: string;
  readonly line: number;
  readonly text: string;
  /** Which rule saw it (`jsxText`, `objectCopy`, ...). */
  readonly rule: string;
};

export function scanFile(file: string, source: string): Finding[] {
  const lines = source.split('\n');
  const stripped = stripComments(source);
  const starts: number[] = [0];
  for (let i = 0; i < stripped.length; i++) if (stripped[i] === '\n') starts.push(i + 1);
  const lineAt = (index: number) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= index) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };
  const kind = { isLib: file.startsWith('lib/'), isTsx: file.endsWith('.tsx') };
  const seen = new Set<string>();
  const out: Finding[] = [];
  for (const c of candidates(stripped, kind)) {
    if (!looksLikeProse(c.text)) continue;
    const line = lineAt(c.index);
    if (EXEMPT.test(lines[line - 1] ?? '')) continue;
    const text = c.text.trim();
    const key = `${line}\u0000${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ file, line, text, rule: c.rule });
  }
  return out;
}

export function sourceFiles(dir: string, root = dir): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const rel = relative(root, path).split('\\').join('/');
    if (statSync(path).isDirectory()) {
      if (!SKIP_DIR.test(rel)) out.push(...sourceFiles(path, root));
    } else if (/\.tsx?$/.test(entry) && !SKIP_FILE.test(entry)) {
      out.push(rel);
    }
  }
  return out;
}

/** Findings per file, keyed by path relative to `src`, only for files that have any. */
export function scanTree(root = 'src'): Record<string, Finding[]> {
  const out: Record<string, Finding[]> = {};
  for (const file of sourceFiles(root)) {
    const findings = scanFile(file, readFileSync(join(root, file), 'utf8'));
    if (findings.length > 0) out[file] = findings;
  }
  return out;
}

/** File -> count, the shape the baseline stores. */
export function countsByFile(tree: Record<string, Finding[]>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [file, findings] of Object.entries(tree).sort(([a], [b]) => a.localeCompare(b))) out[file] = findings.length;
  return out;
}
