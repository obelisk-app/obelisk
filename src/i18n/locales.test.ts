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
