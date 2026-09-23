import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import en from './locales/en.json';
import es from './locales/es.json';
import pt from './locales/pt.json';
import { LOCALES, type Locale } from './index';

const EN = en as Record<string, string>;

/**
 * Every shipped dictionary, keyed by locale.
 *
 * These checks were written against exactly two files, so a third could be
 * added and go entirely unverified — no key parity, no empty-value check,
 * no placeholder check. They loop now; adding a fourth language needs one
 * line here and nothing else.
 */
const DICTIONARIES: Record<Locale, Record<string, string>> = {
  en: EN,
  es: es as Record<string, string>,
  pt: pt as Record<string, string>,
};

/**
 * The banned word per language — see the "Vocabulary" section of
 * CLAUDE.md. It can't be one regex: each language has its own spelling of
 * the term we don't use ("publications", never "forum").
 */
const BANNED: Record<Locale, RegExp> = {
  en: /forum/i,
  es: /\bforos?\b/i,
  pt: /\bf[óo]r(?:um|uns)\b/i,
};

describe('locale files', () => {
  it('ships a dictionary for every locale the app offers', () => {
    // Otherwise `getTranslation` silently serves Spanish for it.
    expect(Object.keys(DICTIONARIES).sort()).toEqual([...LOCALES].sort());
  });

  it('have identical key sets', () => {
    for (const locale of LOCALES) {
      expect(Object.keys(DICTIONARIES[locale]).sort(), locale).toEqual(Object.keys(EN).sort());
    }
  });

  it('have no empty values', () => {
    for (const locale of LOCALES) {
      for (const [k, v] of Object.entries(DICTIONARIES[locale])) {
        expect(v, `${locale} ${k}`).toBeTruthy();
      }
    }
  });

  it('say "publications", never "forum" / "foro" / "fórum", in user-visible copy', () => {
    // Keys are identifiers and may keep the old name (e.g.
    // `mobile.empty.noForum`); only the rendered values are vocabulary.
    for (const locale of LOCALES) {
      const bad = Object.entries(DICTIONARIES[locale])
        .filter(([, v]) => BANNED[locale].test(v))
        .map(([k]) => k);
      expect(bad, locale).toEqual([]);
    }
  });

  it('keep placeholders consistent between languages', () => {
    // A translation that drops `{name}` renders the literal word instead of
    // the channel, and one that invents a placeholder renders braces.
    for (const locale of LOCALES) {
      if (locale === 'en') continue;
      for (const k of Object.keys(EN)) {
        const inEn = (EN[k].match(/\{[a-zA-Z]+\}/g) ?? []).sort();
        const mine = (DICTIONARIES[locale][k]?.match(/\{[a-zA-Z]+\}/g) ?? []).sort();
        expect(mine, `${locale} placeholders for ${k}`).toEqual(inEn);
      }
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
        for (const locale of LOCALES) {
          if (!(key in DICTIONARIES[locale])) missing.push(`${file}: ${key} (${locale})`);
        }
      }
    }
    expect(missing).toEqual([]);
    // A scan that matches nothing would pass forever. If this trips, the
    // regex stopped recognising how the codebase calls `t`.
    expect(checked).toBeGreaterThan(200);
  });
});
