import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * The owner's rule (round 32): text goes through the ui kit's type pieces
 * (docs/ui/conventions.md#type), so a heading, a paragraph and a form label look
 * the same wherever their role is the same.
 *
 *   heading     `Heading` (`src/components/ui/layout/Heading.tsx`): `as` h1-h4
 *               for the outline, `variant` for the look
 *   paragraph   `Text as="p"` (`src/components/ui/layout/Text.tsx`)
 *   form label  `Label` (`src/components/ui/forms/Label.tsx`), or `Field`
 *
 * So this guard fails on a raw `<h1>` to `<h6>`, `<p>` or `<label>` in JSX
 * under `src/components/` or `src/app/`. Outside its reach: the ui kit
 * (`src/components/ui/`, including modal and sheet chrome, renders the
 * elements) and `src/assets/` (drawings whose text is SVG).
 *
 * There is no baseline: the count reached zero in the round that added the
 * guard, and stays there.
 */

const ROOT = process.cwd();
const SCOPE = ['src/components', 'src/app'];
const OUTSIDE = ['src/components/ui/'];
const RAW = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'label']);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [relative(ROOT, path).split(sep).join('/')];
  });
}

/** Every raw text element in a source, as `line: <tag>`. */
export function rawTextElements(source: string, file: string): string[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && RAW.has(n.tagName.getText(sf))) {
      out.push(`${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}: <${n.tagName.getText(sf)}>`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

function scanned(): string[] {
  return SCOPE.flatMap((dir) => files(join(ROOT, dir)))
    .filter((f) => /\.(tsx|jsx)$/.test(f) && !OUTSIDE.some((prefix) => f.startsWith(prefix)));
}

describe('typography: no raw text elements outside the ui kit', () => {
  const found = new Map<string, string[]>();
  for (const file of scanned()) {
    const hits = rawTextElements(readFileSync(join(ROOT, file), 'utf8'), file);
    if (hits.length) found.set(file, hits);
  }

  it('no file renders a raw h1-h6, p or label', () => {
    const offenders = [...found].map(([file, hits]) => `${file}: ${hits.join(', ')}`);
    expect(offenders, 'use Heading, Text as="p" or Label (docs/ui/conventions.md#type)').toEqual([]);
  });

  it('reads the files it means to', () => {
    const all = scanned();
    expect(all).toContain('src/components/marketing/landing/RoadmapSection.tsx');
    expect(all).toContain('src/app/[locale]/(site)/features/page.tsx');
    expect(all.some((f) => f.startsWith('src/components/ui/'))).toBe(false);
  });
});

describe('typography: the rule', () => {
  it('flags every raw heading level, paragraph and label', () => {
    const src = `export default function X() {
      return (<div>
        <h1>a</h1><h2 className="text-3xl">b</h2><h3>c</h3><h4>d</h4><h5>e</h5><h6>f</h6>
        <p className="text-xs text-lc-muted">g</p><label htmlFor="x">h</label><p />
      </div>);
    }`;
    expect(rawTextElements(src, 'X.tsx').map((h) => h.split(': ')[1])).toEqual(
      ['<h1>', '<h2>', '<h3>', '<h4>', '<h5>', '<h6>', '<p>', '<label>', '<p>'],
    );
  });

  it('the real marketing heading the owner pointed at, pasted back, fails', () => {
    const real = readFileSync(join(ROOT, 'src/components/marketing/landing/RoadmapSection.tsx'), 'utf8');
    const pasted = real.replace(
      /<Heading as="h2" variant="section" className="mb-4">([\s\S]*?)<\/Heading>/,
      '<h2 className="text-3xl md:text-4xl font-bold mb-4">$1<span className="text-lc-green">.</span></h2>',
    );
    expect(pasted).not.toBe(real);
    expect(rawTextElements(pasted, 'RoadmapSection.tsx')).toHaveLength(1);
  });

  it('passes the kit pieces and other elements', () => {
    const src = `export default function X() {
      return (<div>
        <Heading as="h2" variant="section">a</Heading><Text as="p" variant="caption">b</Text>
        <Label htmlFor="x" variant="field">c</Label><span className="text-xs">d</span><pre>e</pre>
      </div>);
    }`;
    expect(rawTextElements(src, 'X.tsx')).toEqual([]);
  });
});
