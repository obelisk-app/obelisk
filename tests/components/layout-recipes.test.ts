import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = join(dir, entry.name);
    return entry.isDirectory() ? files(file) : file.endsWith('.tsx') ? [file] : [];
  });
}

/** Repeated visual recipes belong to the primitives, not native tag call sites. */
function repeatedRecipes(source: string): string[] {
  const sf = ts.createSourceFile('component.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hits: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(sf);
      for (const attr of node.attributes.properties) {
        if (!ts.isJsxAttribute(attr) || !['className', 'panelClassName'].includes(attr.name.getText(sf)) || !attr.initializer || !ts.isStringLiteral(attr.initializer)) continue;
        const tokens = new Set(attr.initializer.text.split(/\s+/));
        if (tokens.has('lc-card')) hits.push('Card');
        if (['section', 'Reveal'].includes(tag) && tokens.has('px-6') && tokens.has('py-24')) hits.push('PageSection');
        if (['div', 'main', 'section', 'article', 'header', 'footer', 'nav'].includes(tag) && tokens.has('mx-auto') && [...tokens].some((t) => /^max-w-(sm|md|lg|xl|[2-6]xl)$/.test(t))) hits.push('Container');
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

it('uses shared cards, page sections and bounded containers across all routes and features', () => {
  const offenders = ['src/app', 'src/components'].flatMap(files)
    .filter((f) => !f.startsWith('src/components/ui/'))
    .flatMap((f) => repeatedRecipes(readFileSync(f, 'utf8')).map((primitive) => `${relative(process.cwd(), f)}: use ${primitive}`));
  expect(offenders).toEqual([]);
});

it('recognizes reordered recipes while allowing custom structure and typography', () => {
  expect(repeatedRecipes('<><div className="lc-card p-12 lc-glow" /><section className="py-24 px-6" /><div className="text-center max-w-3xl mx-auto" /></>')).toEqual(['Card', 'PageSection', 'Container']);
  expect(repeatedRecipes('<><Container width="3xl" /><Text className="max-w-xl mx-auto" /><div className="relative" />{/* <div className="lc-card" /> */}</>')).toEqual([]);
});
