/**
 * The load-bearing constraint: this directory imports only `nostr-tools`
 * and itself, so it can be lifted into the SDK unchanged. Test files may
 * additionally import `vitest` and `node:*`, and reach the directory through
 * the `@/lib/relay-hub/` alias since they live in tests/ rather than beside
 * the source.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC_DIR = join(process.cwd(), 'src/lib/relay-hub');
const TEST_DIR = join(process.cwd(), 'tests/lib/relay-hub');

/** Every .ts file in the source directory and its test directory. */
function tsFiles(): Array<{ file: string; path: string }> {
  return [SRC_DIR, TEST_DIR].flatMap((dir) =>
    readdirSync(dir)
      .filter((f) => f.endsWith('.ts'))
      .map((file) => ({ file, path: join(dir, file) })),
  );
}

const IMPORT_RE = /^\s*(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm;

describe('relay-hub isolation', () => {
  it('imports nothing from the rest of obelisk', () => {
    const files = tsFiles();
    expect(files.length).toBeGreaterThan(10);
    const offenders: string[] = [];
    for (const { file, path } of files) {
      const text = readFileSync(path, 'utf8');
      const isTest = file.endsWith('.test.ts') || file === 'test-support.ts';
      for (const match of text.matchAll(IMPORT_RE)) {
        const spec = match[1] ?? match[2];
        if (!spec) continue;
        const ok =
          spec.startsWith('./') ||
          spec === 'nostr-tools' ||
          spec.startsWith('nostr-tools/') ||
          (isTest && (spec === 'vitest' || spec.startsWith('node:') || spec.startsWith('@/lib/relay-hub/')));
        if (!ok) offenders.push(`${file}: ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('never reaches for the escape hatches', () => {
    const offenders: string[] = [];
    for (const { file, path } of tsFiles()) {
      const text = readFileSync(path, 'utf8');
      const lines = text.split('\n');
      lines.forEach((line, i) => {
        if (file === 'isolation.test.ts') return;
        if (/\bas any\b|@ts-ignore|@ts-expect-error/.test(line)) offenders.push(`${file}:${i + 1}`);
        if (line.includes('\u2014')) offenders.push(`${file}:${i + 1} em dash`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
