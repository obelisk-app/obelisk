import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { LOCALES, type Locale } from '@/i18n';
import { MODULES, type Module } from '@/i18n/modules';
import { flatMessages, readModule, type MessageTree } from '@tests/support/messages';
import { icuArguments } from '@tests/support/icu';

/**
 * The message files: `src/i18n/messages/<locale>/<module>.json`.
 *
 * English is the source of truth (the key types are generated from it), so
 * every check compares es and pt against en, module by module. Adding a
 * fourth language needs one entry in `LOCALES` and its folder; nothing here.
 */

function flat(tree: MessageTree, path = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(tree)) {
    const p = path ? `${path}.${k}` : k;
    if (typeof v === 'string') out[p] = v;
    else Object.assign(out, flat(v, p));
  }
  return out;
}

const BY_MODULE: Record<Locale, Record<Module, Record<string, string>>> = Object.fromEntries(
  LOCALES.map((l) => [l, Object.fromEntries(MODULES.map((m) => [m, flat(readModule(l, m))]))]),
) as Record<Locale, Record<Module, Record<string, string>>>;

/**
 * The banned word per language; see the "Vocabulary" section of AGENTS.md
 * ("publications", never "forum"). Each language spells it its own way.
 */
const BANNED: Record<Locale, RegExp> = {
  en: /forum/i,
  es: /\bforos?\b/i,
  pt: /\bf[óo]r(?:um|uns)\b/i,
};

describe('message modules', () => {
  it('ship exactly one file per module per locale, and nothing else', () => {
    for (const locale of LOCALES) {
      const files = readdirSync(join('src', 'i18n', 'messages', locale)).sort();
      expect(files, locale).toEqual(MODULES.map((m) => `${m}.json`).sort());
    }
  });

  it('have exactly the English key set in every locale, module by module', () => {
    for (const locale of LOCALES) {
      for (const m of MODULES) {
        expect(Object.keys(BY_MODULE[locale][m]).sort(), `${locale}/${m}`).toEqual(
          Object.keys(BY_MODULE.en[m]).sort(),
        );
      }
    }
  });

  it('have the same ICU arguments as English for every key', () => {
    // A translation that drops `{name}` prints the literal word instead of
    // the channel; one that invents an argument throws at render time.
    const bad: string[] = [];
    for (const locale of LOCALES) {
      if (locale === 'en') continue;
      for (const m of MODULES) {
        for (const [key, en] of Object.entries(BY_MODULE.en[m])) {
          const mine = BY_MODULE[locale][m][key];
          if (mine === undefined) continue;
          if (JSON.stringify(icuArguments(mine)) !== JSON.stringify(icuArguments(en))) {
            bad.push(`${locale} ${m}.${key}: ${JSON.stringify(icuArguments(mine))} vs en ${JSON.stringify(icuArguments(en))}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('have no empty values', () => {
    for (const locale of LOCALES) {
      for (const [k, v] of Object.entries(flatMessages(locale))) {
        expect(v, `${locale} ${k}`).toBeTruthy();
      }
    }
  });

  it('say "publications", never "forum" / "foro" / "fórum", in user-visible copy', () => {
    // Keys are identifiers and may keep the old name (`mobile.empty.noForum`);
    // only the rendered values are vocabulary.
    for (const locale of LOCALES) {
      const bad = Object.entries(flatMessages(locale))
        .filter(([, v]) => BANNED[locale].test(v))
        .map(([k]) => k);
      expect(bad, locale).toEqual([]);
    }
  });

  it('contain no em dash in any value', () => {
    // The owner's rule: no em dashes anywhere, translations included.
    for (const locale of LOCALES) {
      const bad = Object.entries(flatMessages(locale))
        .filter(([, v]) => v.includes('\u2014'))
        .map(([k]) => k);
      expect(bad, locale).toEqual([]);
    }
  });
});
