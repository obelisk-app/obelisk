/**
 * The owner's rule: no em dash (U+2014) in any file. Code, comments, tests,
 * docs. Before round 16 nothing enforced it, and the re-audit counted 642
 * lines carrying one in src/ alone, most of them added after the rule was
 * written. A rule nobody checks drifts.
 *
 * So this reads every tracked text file under src/, tests/, scripts/, docs/,
 * content/ (the published guides), .github/ and .claude/, the text assets
 * under public/ (SVG snapshots, the web manifest, security.txt, the service
 * worker), and every file at the repo root (Markdown, config, .gitignore,
 * LICENSE), and fails on the literal character, naming the file and line.
 * Round 17 widened it from src/, tests/, scripts/, docs/ and the root
 * Markdown alone, after the guides were found holding about 375 em dashes
 * the old scope never looked at.
 *
 * Out of scope on purpose, listed in NOT_COVERED with the reason: files a
 * tool writes and nobody edits by hand, where a dash could only arrive from
 * upstream and could not be fixed here. Binary assets under public/ (PNG,
 * MP3, MP4, GIF, STL) are skipped by extension, and a NUL byte skips any
 * other binary that slips through.
 *
 * Code that has to handle the character as data (an HTML entity decoder, a
 * parser that strips an em dash out of a tweet) writes it as the escape
 * `\u2014`, which this test does not flag: the rule is about the text people
 * read and write, and the escape spells out what the code means.
 *
 * Folders other round 16 branches were sweeping at the same time are listed
 * in EXCEPTIONS. That list only shrinks: an entry whose folder no longer
 * holds an em dash fails the run, so it has to be deleted the moment it
 * stops being needed, and the list cannot hide a regression for long.
 *
 * Why a test and not scripts/check-source-bytes.sh: that script rejects raw
 * control bytes, which break tools (grep treats the file as binary). An em
 * dash breaks nothing; it is a house style rule, and it needs a list of
 * exceptions that must fail when stale. A test can hold that list with a
 * reason per entry and check it both ways; a Perl one-liner cannot do so
 * readably. `npm test` already runs in CI, so the gate is the same.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const EM_DASH = '\u2014';

/** Folders (ending in `/`) the rule covers whole, from the repo root. */
const COVERED_DIRS = ['src/', 'tests/', 'scripts/', 'docs/', 'content/', '.github/', '.claude/'] as const;

/** Under public/ only text assets are read; the rest is images, audio, video and a mesh. */
const PUBLIC_TEXT = /^public\/.+\.(svg|txt|json|md|webmanifest|js|xml|css|html)$/;

/** Generated files that are deliberately not read, with the reason. */
const NOT_COVERED: Readonly<Record<string, string>> = {
  'package-lock.json': 'written by npm from the registry; nobody edits it, and a dash in a dependency field could not be fixed here',
};

/** Whether the rule applies to this repo-relative path. */
function isCovered(path: string): boolean {
  if (path in NOT_COVERED) return false;
  if (COVERED_DIRS.some((dir) => path.startsWith(dir))) return true;
  if (PUBLIC_TEXT.test(path)) return true;
  return !path.includes('/');
}

/**
 * Paths allowed to hold an em dash, each with its reason. Each must still
 * contain at least one, or the stale-entry check below fails. Empty since
 * round 17: nothing is exempt.
 */
const EXCEPTIONS: Readonly<Record<string, string>> = {};

/** Tracked files plus new untracked ones, so a file not yet added is still checked. */
function candidateFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const paths = [...new Set(out.split('\0').filter(Boolean))];
  return paths
    .filter(isCovered)
    .filter((path) => existsSync(join(ROOT, path)) && statSync(join(ROOT, path)).isFile())
    .sort();
}

/** 1-based line numbers carrying a literal em dash, or [] for a binary file. */
function emDashLines(bytes: Buffer): number[] {
  // A NUL byte means an image or another binary file (check-source-bytes.sh
  // keeps NUL out of text files), where the em dash byte sequence can occur
  // by chance and means nothing.
  if (bytes.includes(0)) return [];
  const lines = bytes.toString('utf8').split('\n');
  const hits: number[] = [];
  lines.forEach((line, i) => {
    if (line.includes(EM_DASH)) hits.push(i + 1);
  });
  return hits;
}

function exceptionFor(path: string): string | undefined {
  return Object.keys(EXCEPTIONS).find((entry) => (entry.endsWith('/') ? path.startsWith(entry) : path === entry));
}

function scan(): { files: string[]; hits: Map<string, number[]> } {
  const files = candidateFiles();
  const hits = new Map<string, number[]>();
  for (const path of files) {
    const lines = emDashLines(readFileSync(join(ROOT, path)));
    if (lines.length > 0) hits.set(path, lines);
  }
  return { files, hits };
}

describe('no em dash in the source, tests, scripts, docs, guides, public text assets or root files', () => {
  const { files, hits } = scan();

  // Without this the guard passes vacuously if git lists nothing (no
  // checkout, wrong working directory) or a covered folder is renamed.
  it('is reading the real tree', () => {
    for (const dir of ['src/', 'tests/', 'scripts/', 'docs/', 'content/']) {
      expect(files.filter((path) => path.startsWith(dir)).length, dir).toBeGreaterThan(5);
    }
    expect(files.filter((path) => path.startsWith('public/')).length, 'public/').toBeGreaterThan(5);
    for (const dir of ['.github/', '.claude/']) {
      expect(files.some((path) => path.startsWith(dir)), dir).toBe(true);
    }
    for (const path of [
      'README.md',
      'package.json',
      'next.config.ts',
      '.gitignore',
      'content/guides/en/what-is-obelisk.mdx',
      'public/og/guides/vesta.svg',
      'public/sw.js',
      'tests/no-em-dash.test.ts',
    ]) {
      expect(files).toContain(path);
    }
    for (const path of Object.keys(NOT_COVERED)) {
      expect(existsSync(join(ROOT, path)), `${path} is gone; delete its NOT_COVERED entry`).toBe(true);
    }
  });

  it('reads text assets under public/ and skips binaries and generated files', () => {
    expect(isCovered('public/og/guides/vesta.svg')).toBe(true);
    expect(isCovered('public/.well-known/security.txt')).toBe(true);
    expect(isCovered('public/og/guides/games/manifest.json')).toBe(true);
    expect(isCovered('public/site.webmanifest')).toBe(true);
    expect(isCovered('public/og/guides/vesta.png')).toBe(false);
    expect(isCovered('public/obelisk.stl')).toBe(false);
    expect(isCovered('public/media-kit/video/obelisk-promo.mp4')).toBe(false);
    expect(isCovered('content/guides/es/vesta.mdx')).toBe(true);
    expect(isCovered('ecosystem.config.js')).toBe(true);
    expect(isCovered('LICENSE')).toBe(true);
    expect(isCovered('package-lock.json')).toBe(false);
  });

  it('finds none outside the temporary exceptions', () => {
    const offenders: string[] = [];
    for (const [path, lines] of hits) {
      if (!exceptionFor(path)) offenders.push(`${path}:${lines.join(',')}`);
    }
    expect(offenders, 'replace each em dash with a comma, colon, parentheses, full stop or spaced hyphen').toEqual(
      [],
    );
  });

  it('keeps no stale exception', () => {
    const stale = Object.keys(EXCEPTIONS).filter(
      (entry) => ![...hits.keys()].some((path) => (entry.endsWith('/') ? path.startsWith(entry) : path === entry)),
    );
    expect(stale, 'these paths are clean now; delete their EXCEPTIONS entries').toEqual([]);
  });

  it('sees an em dash wherever it sits on a line, and skips binary files', () => {
    const text = ['first line', `a ${EM_DASH} b`, 'clean', `end${EM_DASH}`, 'escaped \\u2014 is fine'].join('\n');
    expect(emDashLines(Buffer.from(text, 'utf8'))).toEqual([2, 4]);
    expect(emDashLines(Buffer.concat([Buffer.from([0x89, 0x50, 0x00]), Buffer.from(EM_DASH, 'utf8')]))).toEqual([]);
  });
});
