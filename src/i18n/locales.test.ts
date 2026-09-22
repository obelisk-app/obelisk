import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import en from './locales/en.json';
import es from './locales/es.json';

const EN = en as Record<string, string>;
const ES = es as Record<string, string>;

describe('locale files', () => {
  it('have identical key sets', () => {
    expect(Object.keys(EN).sort()).toEqual(Object.keys(ES).sort());
  });

  it('have no empty values', () => {
    for (const [k, v] of Object.entries(EN)) expect(v, `en ${k}`).toBeTruthy();
    for (const [k, v] of Object.entries(ES)) expect(v, `es ${k}`).toBeTruthy();
  });

  it('say "publications", never "forum" / "foro", in user-visible copy', () => {
    // Keys are identifiers and may keep the old name (e.g.
    // `mobile.empty.noForum`); only the rendered values are vocabulary.
    // See the "Vocabulary" section of CLAUDE.md.
    const bad = (obj: Record<string, string>, re: RegExp) =>
      Object.entries(obj).filter(([, v]) => re.test(v)).map(([k]) => k);

    expect(bad(EN, /forum/i)).toEqual([]);
    expect(bad(ES, /\bforos?\b/i)).toEqual([]);
  });

  it('keep placeholders consistent between languages', () => {
    for (const k of Object.keys(EN)) {
      const inEn = (EN[k].match(/\{[a-zA-Z]+\}/g) ?? []).sort();
      const inEs = (ES[k].match(/\{[a-zA-Z]+\}/g) ?? []).sort();
      expect(inEs, `placeholders for ${k}`).toEqual(inEn);
    }
  });
});

/**
 * Keys the code asks for, but nobody wrote.
 *
 * The parity test above compares the two locale files against each other,
 * so a key missing from *both* is invisible to it — the string just renders
 * as its own identifier in the UI ("common.loading"), which is how one
 * shipped.
 */
describe('every key the code uses exists', () => {
  const LITERAL = /\bt\(\s*'([a-zA-Z0-9_.]+)'\s*\)/g;

  function sourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
      else if (/\.tsx?$/.test(entry) && !entry.includes('.test.')) out.push(path);
    }
    return out;
  }

  it('finds no t() call pointing at a key that does not exist', () => {
    const missing: string[] = [];
    let checked = 0;
    for (const file of sourceFiles('src')) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(LITERAL)) {
        const key = match[1];
        checked += 1;
        // Only plain literals are checked: `t(\`social.filter.${value}\`)`
        // is resolved at runtime and can't be verified here.
        if (!(key in EN)) missing.push(`${file}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
    // A scan that matches nothing would pass forever. If this trips, the
    // regex stopped recognising how the codebase calls `t`.
    expect(checked).toBeGreaterThan(200);
  });
});
