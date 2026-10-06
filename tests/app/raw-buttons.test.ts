import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A ratchet on hand-written `<button>`s in the desktop routes of `src/app/`.
 *
 * `Button`, `CloseButton`, `Chip` and the rest of `src/components/ui/` carry
 * the focus ring, the disabled look and `type="button"` once; every raw
 * `<button>` re-types them. What is left here is a shape no primitive has
 * yet (list rows, rail tiles, the login flow's own stylesheet, emoji tiles),
 * listed in audits/obelisk/round16/app.md. The number may only go down: when
 * a primitive learns one of those shapes, migrate and lower it.
 *
 * Not counted: the phone shell (`app/mobile/`), a separate design with its
 * own stylesheet buttons, and the dev-only screenshot harness (`dev/`).
 */
const CEILING = 43;

const ROOT = join(__dirname, '..', '..');
const APP = join(ROOT, 'src', 'app');
const EXCLUDED = [join(APP, '[locale]', 'app', 'mobile'), join(APP, 'dev')];

function tsxFiles(dir: string, out: string[] = []): string[] {
  if (EXCLUDED.includes(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) tsxFiles(full, out);
    else if (name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

describe('raw <button> in the desktop routes', () => {
  it(`stays at or under ${CEILING}`, () => {
    const perFile = tsxFiles(APP)
      .map((f) => ({ file: relative(ROOT, f), count: (readFileSync(f, 'utf8').match(/<button\b/g) ?? []).length }))
      .filter((r) => r.count > 0);
    const total = perFile.reduce((n, r) => n + r.count, 0);
    expect(perFile.length).toBeGreaterThan(0);
    expect(total, JSON.stringify(perFile, null, 1)).toBeLessThanOrEqual(CEILING);
  });
});
