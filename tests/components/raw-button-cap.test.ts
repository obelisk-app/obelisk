import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A ratchet on hand-written `<button>` elements in `src/components/` and
 * `src/hooks/`. Each one re-decides the focus ring, the disabled look and
 * `type="button"`; the primitives in `src/components/ui/` decide them once.
 *
 * The cap is the count when round 16 finished (188 at its start). It may
 * only go down: when you move a button onto a primitive, lower `CAP` to the
 * new count in the same commit. If you truly need a new hand-written one,
 * the failure message lists the files so you can migrate another instead.
 *
 * Inside `ui/` only the primitives themselves may render a raw `<button>`,
 * each no more often than it does now.
 */

const CAP = 102;

const UI_PRIMITIVE_BUTTONS: Record<string, number> = {
  'src/components/ui/Button.tsx': 1,
  'src/components/ui/Chip.tsx': 2,
  'src/components/ui/IconButton.tsx': 1,
  'src/components/ui/OptionRow.tsx': 1,
  'src/components/ui/SegmentedControl.tsx': 1,
  'src/components/ui/TextButton.tsx': 1,
  'src/components/ui/Toggle.tsx': 1,
  'src/components/ui/UserRow.tsx': 1,
  'src/components/ui/menu.tsx': 1,
};

const ROOT = process.cwd();
const RAW_BUTTON = /<button(?=[\s>]|$)/g;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

/** Raw `<button` openings in a source text, ignoring comment lines. */
export function countRawButtons(source: string): number {
  let count = 0;
  for (const line of source.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('{/*')) continue;
    count += line.match(RAW_BUTTON)?.length ?? 0;
  }
  return count;
}

function countsByFile(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const dir of ['src/components', 'src/hooks']) {
    for (const file of sourceFiles(join(ROOT, dir))) {
      const n = countRawButtons(readFileSync(file, 'utf8'));
      if (n > 0) counts.set(relative(ROOT, file), n);
    }
  }
  return counts;
}

describe('countRawButtons', () => {
  it('counts openings, not closings, and skips comments', () => {
    const src = [
      '<button type="button">a</button>',
      '<button',
      '  // <button> in a line comment',
      ' * <button> in a block comment',
      '{/* <button> */}',
      '<Button>not raw</Button>',
      '<buttonish />',
    ].join('\n');
    expect(countRawButtons(src)).toBe(2);
  });
});

describe('raw <button> ratchet', () => {
  const counts = countsByFile();
  const outsideUi = [...counts].filter(([file]) => !file.startsWith('src/components/ui/'));
  const total = outsideUi.reduce((sum, [, n]) => sum + n, 0);

  it(`stays at or below ${CAP} outside src/components/ui/`, () => {
    const listing = outsideUi.sort((a, b) => b[1] - a[1]).map(([f, n]) => `${n} ${f}`).join('\n');
    expect(total, `raw <button> count rose to ${total} (cap ${CAP}):\n${listing}`).toBeLessThanOrEqual(CAP);
  });

  it('inside ui/ only the primitives render a raw <button>', () => {
    const inUi = Object.fromEntries([...counts].filter(([file]) => file.startsWith('src/components/ui/')));
    for (const [file, n] of Object.entries(inUi)) {
      expect(UI_PRIMITIVE_BUTTONS[file], `${file} is not a button primitive`).toBeDefined();
      expect(n, file).toBeLessThanOrEqual(UI_PRIMITIVE_BUTTONS[file]);
    }
  });
});
