// @vitest-environment node
/**
 * Guards on eslint.config.mjs itself, so the lint gate cannot be switched off
 * by accident.
 *
 * 1. Every path-scoped glob in this repo's own config blocks matches at least
 *    one file. A rule scoped to a folder that was moved or renamed matches
 *    nothing, and ESLint says nothing about it: the rule is simply off. An
 *    earlier round found exactly that in another guard, which went on
 *    passing while it scanned a folder that no longer existed.
 * 2. The 300-line rule is on for src/, and no block of this config switches
 *    it off or loosens it for any file.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ESLint, type Linter } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

const ROOT = process.cwd();

/** The names this repo gives its own blocks; the presets from eslint-config-next are not checked. */
const OWN_BLOCKS = [
  'obelisk/rules',
  'obelisk/tests',
  'obelisk/react-hooks-temporary-warn',
  'obelisk/event-media-img',
  'obelisk/scripts',
  'obelisk/locale-aware-navigation',
  'obelisk/max-lines',
];

/**
 * A glob as ESLint's flat config reads it (minimatch, relative to the repo
 * root), for the syntax this config uses: `**`, `*` and `?`. Anything else
 * fails the test rather than being matched wrongly.
 */
function globToRegExp(glob: string): RegExp {
  // `[locale]` is a literal Next.js folder name here, not a character class.
  if (/[{}!]/.test(glob)) throw new Error(`unsupported glob syntax in ${glob}; extend globToRegExp`);
  let out = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      const slash = glob[i + 2] === '/';
      out += slash ? '(?:.*/)?' : '.*';
      i += slash ? 2 : 1;
    } else if (c === '*') {
      out += '[^/]*';
    } else if (c === '?') {
      out += '[^/]';
    } else {
      out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${out}$`);
}

function repoFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split('\0').filter((path) => path && existsSync(join(ROOT, path)));
}

function globsOf(block: Linter.Config): string[] {
  return (block.files ?? []).flat().filter((glob): glob is string => typeof glob === 'string');
}

describe('eslint.config.mjs', () => {
  let ownBlocks: Linter.Config[] = [];
  let files: string[] = [];

  beforeAll(async () => {
    const mod: { default: Linter.Config[] } = await import(
      /* @vite-ignore */ pathToFileURL(join(ROOT, 'eslint.config.mjs')).href
    );
    ownBlocks = mod.default.filter((block) => typeof block.name === 'string' && block.name.startsWith('obelisk/'));
    files = repoFiles();
  });

  // Without this, renaming or dropping the block names would leave the
  // checks below looping over nothing.
  it('still has every block these checks are about', () => {
    expect(ownBlocks.map((block) => block.name)).toEqual(OWN_BLOCKS);
  });

  it('scopes no rule to a path that matches nothing', () => {
    const unmatched: string[] = [];
    for (const block of ownBlocks) {
      for (const glob of globsOf(block)) {
        const re = globToRegExp(glob);
        if (!files.some((path) => re.test(path))) unmatched.push(`${block.name}: ${glob}`);
      }
    }
    expect(unmatched, 'each of these globs matches no file, so its rule is silently off').toEqual([]);
  });

  it('reads globs the way ESLint does', () => {
    expect(globToRegExp('src/**').test('src/a/b.ts')).toBe(true);
    expect(globToRegExp('src/**').test('srcx/a.ts')).toBe(false);
    expect(globToRegExp('**/*.test.ts').test('tests/a/b.test.ts')).toBe(true);
    expect(globToRegExp('**/*.test.ts').test('a.test.ts')).toBe(true);
    expect(globToRegExp('**/*.test.ts').test('tests/a/b.test.tsx')).toBe(false);
    expect(globToRegExp('src/services/relay/relay-roles.ts').test('src/services/relay/relay-roles-sync.ts')).toBe(false);
    expect(globToRegExp('src/lib/*').test('src/lib/a/b.ts')).toBe(false);
    expect(() => globToRegExp('src/{a,b}/**')).toThrow();
  });

  describe('the 300-line rule', () => {
    const eslint = new ESLint({ cwd: ROOT });

    it('is an error everywhere in src/', async () => {
      const config = await eslint.calculateConfigForFile(join(ROOT, 'src/utils/nostr/nip-kinds.ts'));
      expect(config.rules?.['max-lines']).toEqual([2, { max: 300, skipBlankLines: true, skipComments: true }]);
    });

    it('has no exemptions: only its own block sets max-lines', () => {
      const others = ownBlocks
        .filter((block) => block.name !== 'obelisk/max-lines' && block.rules && 'max-lines' in block.rules)
        .map((block) => block.name);
      expect(others, 'a block loosens the 300-line rule; split the file instead').toEqual([]);
    });
  });
});

describe('locale-aware navigation', () => {
  it('bans next/link and the raw router outside src/i18n, and allows them inside', async () => {
    const { ESLint } = await import('eslint');
    const eslint = new ESLint();
    const lint = async (filePath: string, code: string) =>
      (await eslint.lintText(code, { filePath }))[0].messages.filter((m) => m.ruleId === 'no-restricted-imports');
    const code = "import Link from 'next/link';\nimport { useRouter, notFound } from 'next/navigation';\nexport const x = [Link, useRouter, notFound];\n";
    expect(await lint('src/components/marketing/Probe.tsx', code)).toHaveLength(2);
    expect(await lint('src/i18n/probe.ts', code)).toHaveLength(0);
    expect(await lint('src/components/marketing/Probe.tsx', "import { notFound, useParams } from 'next/navigation';\nexport const x = [notFound, useParams];\n")).toHaveLength(0);
  }, 60_000);
});
