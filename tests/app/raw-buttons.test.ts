import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/** All routes, including mobile and development screens, use shared UI controls. */
const CEILING = 0;

const ROOT = join(__dirname, '..', '..');
const APP = join(ROOT, 'src', 'app');

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) tsxFiles(full, out);
    else if (name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

describe('raw <button> in the routes', () => {
  it(`stays at or under ${CEILING}`, () => {
    const perFile = tsxFiles(APP)
      .map((f) => ({ file: relative(ROOT, f), count: (readFileSync(f, 'utf8').match(/<button\b/g) ?? []).length }))
      .filter((r) => r.count > 0);
    const total = perFile.reduce((n, r) => n + r.count, 0);
    expect(total, JSON.stringify(perFile, null, 1)).toBeLessThanOrEqual(CEILING);
    expect(CEILING, `only ${total} raw <button>s in the routes now: set CEILING to ${total}`).toBe(total);
  });
});
