import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { flatMessages } from '@tests/support/messages';
import { requiredValues } from '@tests/support/icu';

/**
 * A message with `{name}` rendered without `name` throws inside next-intl
 * and the reader sees the raw key. The key types catch a missing key, not a
 * missing argument (the JSON is typed as plain strings), so this reads every
 * literal `t('key', { ... })` in `src/` and compares the object's keys with
 * the arguments the English message declares.
 */

const EN = flatMessages('en');
const CALL = /\b(?:t|t\.rich|tr|translate|translate\.current)\(\s*'([a-zA-Z0-9_.]+)'\s*(\)|,)/g;

function files(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

/** The top-level property names of the object literal that starts at `i`. */
function objectKeys(source: string, i: number): string[] | null {
  while (/\s/.test(source[i])) i++;
  if (source[i] !== '{') return null;
  let depth = 0;
  let j = i;
  for (; j < source.length; j++) {
    if (source[j] === '{') depth++;
    else if (source[j] === '}' && --depth === 0) break;
  }
  const body = source.slice(i + 1, j);
  const entries: string[] = [];
  let level = 0;
  let token = '';
  for (const c of body) {
    if ('{(['.includes(c)) level++;
    if ('})]'.includes(c)) level--;
    if (c === ',' && level === 0) { entries.push(token); token = ''; } else token += c;
  }
  entries.push(token);
  return entries
    .map((e) => e.trim().match(/^(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))/))
    .map((m) => (m ? m[1] ?? m[2] ?? m[3] : ''))
    .filter(Boolean)
    .sort();
}

describe('every literal t() call passes the ICU arguments its message needs', () => {
  it('finds no call with a missing or unknown argument', () => {
    const bad: string[] = [];
    let checked = 0;
    for (const file of files('src')) {
      const source = readFileSync(file, 'utf8');
      for (const m of source.matchAll(CALL)) {
        const message = EN[m[1]];
        if (message === undefined) continue; // tsc reports unknown keys
        checked += 1;
        const needed = requiredValues(message);
        const given = m[2] === ',' ? objectKeys(source, (m.index ?? 0) + m[0].length) : [];
        if (given === null) continue; // values passed as a variable
        if (JSON.stringify(given) !== JSON.stringify(needed)) {
          bad.push(`${file}: ${m[1]} needs [${needed}] got [${given}]`);
        }
      }
    }
    expect(bad).toEqual([]);
    expect(checked).toBeGreaterThan(1000);
  });
});
