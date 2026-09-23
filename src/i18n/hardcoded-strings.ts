/**
 * Finds user-visible text that never reaches a dictionary.
 *
 * `locales.test.ts` checks the forward direction — every key the code asks
 * a translate call for exists. This is the inverse, and it's the one that
 * matters for a third language: ~670 strings are written straight into JSX, so
 * they are English *in the Spanish build too*, and no amount of
 * translating `pt.json` touches them.
 *
 * Exported as a module rather than living inside the test because the
 * baseline is generated from it (`npm run i18n:baseline`), and a scanner
 * that can't be re-run is a scanner nobody updates.
 *
 * ## What counts as user-visible
 *
 * JSX text between tags, and the handful of attributes a person actually
 * reads: `placeholder`, `title`, `aria-label`, `alt`, `label`. Not
 * `className`, not `data-*`, not imports, not `console.*`.
 *
 * ## What is deliberately ignored
 *
 * Anything that isn't prose: single words with no letters (`#`, `⋯`),
 * protocol and identifier fragments (`wss://`, `npub`, `kind 9`),
 * interpolations (`{count}`), and short lowercase tokens. The rule is two
 * or more letters plus either a space or an initial capital — enough to
 * catch "Add relay" and "No messages yet" while leaving `px`, `nsec` and
 * `id` alone.
 *
 * False positives belong in the baseline with a reason, not in a
 * suppression list nobody reads.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Attributes whose value a person reads. */
const TEXT_ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'alt', 'label'];

const ATTRIBUTE_RE = new RegExp(
  `\\b(?:${TEXT_ATTRIBUTES.join('|')})\\s*=\\s*"([^"]{2,})"`,
  'g',
);

/**
 * JSX text between tags. Deliberately crude — it over-matches into things
 * like `{cond && (` which the prose filter then discards.
 */
const JSX_TEXT_RE = />\s*([A-Za-z][^<>{}\n]{1,120}?)\s*</g;

/** Files that are not shipped UI. */
const SKIP_FILE = /\.(test|spec)\.[tj]sx?$|\.d\.ts$/;

/**
 * Source that the crude JSX-text regex swallows: a generic parameter
 * (`Promise<void>` reads as `>Promise<`), a ternary or a `&&` guard split
 * across lines. None of it is copy, and leaving it in the baseline made the
 * baseline look like unfinished work rather than a list of real exemptions.
 */
const CODE_SHAPED = /===|!==|&&|\|\||=>|\?\s*\(|\($/;

/** Type names the generic-parameter case produces most often. */
const TYPE_NAMES = new Set([
  'Promise', 'Partial', 'Record', 'Array', 'Map', 'Set', 'Readonly',
  'Omit', 'Pick', 'Awaited', 'ReturnType',
]);

/**
 * Is this prose a reader would notice, rather than a token?
 *
 * The two-letter floor plus "has a space or starts capitalised" is what
 * separates "Add relay" from `px`, `wss`, `npub1…` and `{count}`.
 */
export function looksLikeProse(value: string): boolean {
  const text = value.trim();
  if (text.length < 3) return false;
  if (CODE_SHAPED.test(text)) return false;
  if (TYPE_NAMES.has(text)) return false;
  // Short acronyms — SFU, GIF, B2B, PWA. A translator has nothing to do
  // with them, and they are the same word in every language we ship.
  if (text.length <= 5 && /^[A-Z0-9-]+$/.test(text)) return false;
  // Pure interpolation, or a fragment of one.
  if (/^[{}]/.test(text) || /^\{.*\}$/.test(text)) return false;
  // Identifiers, URLs, protocol words, file paths.
  if (/^(?:wss?|https?):/.test(text)) return false;
  if (/^[a-z0-9_-]+$/.test(text)) return false;
  if (/^[@#./$]/.test(text)) return false;
  // Needs actual letters.
  const letters = text.replace(/[^A-Za-z]/g, '');
  if (letters.length < 2) return false;
  // Prose has a space, or begins as a sentence does.
  return text.includes(' ') || /^[A-Z]/.test(text);
}

export type Finding = {
  /** Repo-relative path. */
  readonly file: string;
  readonly line: number;
  readonly text: string;
};

export function scanFile(file: string, source: string): Finding[] {
  const out: Finding[] = [];
  const lineAt = (index: number) => source.slice(0, index).split('\n').length;

  const push = (text: string, index: number) => {
    if (!looksLikeProse(text)) return;
    out.push({ file, line: lineAt(index), text: text.trim() });
  };

  for (const match of source.matchAll(ATTRIBUTE_RE)) {
    push(match[1], match.index ?? 0);
  }
  for (const match of source.matchAll(JSX_TEXT_RE)) {
    push(match[1], match.index ?? 0);
  }
  return out;
}

export function sourceFiles(dir: string, root = dir): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...sourceFiles(path, root));
    } else if (/\.tsx$/.test(entry) && !SKIP_FILE.test(entry)) {
      out.push(relative(root, path));
    }
  }
  return out;
}

/** Findings per file, keyed by repo-relative path, only for files that have any. */
export function scanTree(root = 'src'): Record<string, Finding[]> {
  const out: Record<string, Finding[]> = {};
  for (const file of sourceFiles(root)) {
    const findings = scanFile(file, readFileSync(join(root, file), 'utf8'));
    if (findings.length > 0) out[file] = findings;
  }
  return out;
}

/** File → count, the shape the baseline stores. */
export function countsByFile(tree: Record<string, Finding[]>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [file, findings] of Object.entries(tree)) out[file] = findings.length;
  return out;
}
