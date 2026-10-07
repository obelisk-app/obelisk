import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * The owner's rule (round 31): every picture the app draws lives in
 * `src/assets/` (docs/conventions.md#assets).
 *
 *   src/assets/icons/          every UI icon, one `<Name>Icon.tsx` per icon, drawn on `IconSvg`
 *   src/assets/brand/          the Obelisk marks and other brand marks
 *   src/assets/illustrations/  guide heroes, diagrams and marks, OG card art, other artwork
 *   src/assets/textures/       image files the stylesheets reference
 *
 * Files that must be served by URL (favicon, OG PNGs, manifest icons,
 * fonts, `sw.js`) stay in `public/`.
 *
 * So this guard fails when, outside `src/assets/`:
 *   1. a file renders SVG: an `<svg>` element or an SVG shape (`<path>`,
 *      `<circle>`, `<g>`, ...) in JSX, or `<svg` markup in a string or a
 *      stylesheet (a data URI);
 *   2. a component named `...Icon` is defined anywhere but `src/assets/icons/`
 *      (and `src/assets/brand/ObeliskIcon.tsx`, the app icon's silhouette,
 *      which the brand folder keeps under its name);
 * and when, inside it:
 *   3. `src/assets/icons/` holds anything but icon files (`<Name>Icon.tsx`,
 *      whose default export is that component), `IconSvg.tsx` and the
 *      `index.ts` barrel, or the barrel misses an icon;
 *   4. two icon files draw the same thing (the same shapes with the same
 *      path data): one drawing, one icon, every caller pointed at it.
 *
 * `DATA_DRIVEN` is the reasoned list of files allowed to draw SVG because
 * the drawing is computed from live data at render time (a chart, a meter, a
 * QR code). A static shape inside such a component still moves to assets.
 * The list only shrinks; it is empty today.
 */

const ROOT = process.cwd();
const ASSETS = 'src/assets';
const ICONS = 'src/assets/icons';
const BRAND_ICON = 'src/assets/brand/ObeliskIcon.tsx';

export const DATA_DRIVEN: Readonly<Record<string, string>> = {};

/** SVG element names; none of them is an HTML element, so any of them in JSX is a drawing. */
const SVG_TAGS = new Set([
  'svg', 'path', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'rect', 'g', 'defs', 'use', 'symbol',
  'clipPath', 'mask', 'pattern', 'linearGradient', 'radialGradient', 'stop', 'filter', 'text', 'tspan',
  'foreignObject', 'marker', 'animate', 'animateTransform', 'feTurbulence', 'feColorMatrix', 'feGaussianBlur',
]);
const CODE = /\.(ts|tsx|js|jsx|mjs|mts)$/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [relative(ROOT, path).split(sep).join('/')];
  });
}

const parse = (source: string, file: string) =>
  ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

/** Every place a source draws SVG, as `line: what`. */
export function svgFindings(source: string, file: string): string[] {
  if (file.endsWith('.css')) {
    const text = source.replace(/\/\*[\s\S]*?\*\//g, '');
    return /<svg/i.test(text) ? ['svg markup in a stylesheet'] : [];
  }
  const sf = parse(source, file);
  const out: string[] = [];
  const line = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const visit = (n: ts.Node) => {
    if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && SVG_TAGS.has(n.tagName.getText(sf))) {
      out.push(`${line(n)}: <${n.tagName.getText(sf)}>`);
    }
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) && /<svg/i.test(n.text)) {
      out.push(`${line(n)}: svg markup in a string`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** Components named `...Icon` a source defines at its top level. */
export function iconComponentsDefined(source: string, file: string): string[] {
  const sf = parse(source, file);
  const names: string[] = [];
  for (const s of sf.statements) {
    if (ts.isFunctionDeclaration(s) && s.name) names.push(s.name.text);
    if (ts.isVariableStatement(s)) for (const d of s.declarationList.declarations) if (ts.isIdentifier(d.name)) names.push(d.name.text);
    if (ts.isClassDeclaration(s) && s.name) names.push(s.name.text);
  }
  return names.filter((n) => /^[A-Z][A-Za-z0-9]*Icon$/.test(n));
}

/** What an icon file draws: its shape elements with their attributes, in order. */
export function drawingOf(source: string, file: string): string {
  const sf = parse(source, file);
  const shapes: string[] = [];
  const visit = (n: ts.Node) => {
    if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && SVG_TAGS.has(n.tagName.getText(sf))) {
      const attrs = n.attributes.properties
        .filter(ts.isJsxAttribute)
        .map((a) => `${a.name.getText(sf)}=${(a.initializer?.getText(sf) ?? 'true').replace(/^\{(.*)\}$/, '$1').replace(/^['"](.*)['"]$/, '$1')}`)
        .sort();
      shapes.push(`<${n.tagName.getText(sf)} ${attrs.join(' ')}>`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return shapes.join('');
}

/** Pairs of icon files that draw the same thing. */
export function duplicateDrawings(sources: Readonly<Record<string, string>>): string[] {
  const seen = new Map<string, string>();
  const dups: string[] = [];
  for (const [file, source] of Object.entries(sources)) {
    const drawing = drawingOf(source, file);
    if (!drawing) continue;
    const first = seen.get(drawing);
    if (first) dups.push(`${basename(first)} = ${basename(file)}`);
    else seen.set(drawing, file);
  }
  return dups;
}

/** Why a file in `src/assets/icons/` does not belong there, or null. */
export function iconFileProblem(source: string, file: string): string | null {
  const name = basename(file);
  if (name === 'index.ts' || name === 'IconSvg.tsx') return null;
  const m = /^([A-Z][A-Za-z0-9]*Icon)\.tsx$/.exec(name);
  if (!m) return `not an icon file: ${file}`;
  if (!new RegExp(`export default function ${m[1]}\\b`).test(source)) return `${file} does not default-export ${m[1]}`;
  if (!source.includes("from './IconSvg'")) return `${file} does not draw on IconSvg`;
  return null;
}

describe('every picture lives in src/assets', () => {
  const all = files(join(ROOT, 'src'));
  const outside = all.filter((f) => !f.startsWith(`${ASSETS}/`) && (CODE.test(f) || f.endsWith('.css')));

  it('is looking at the real tree', () => {
    expect(outside.length).toBeGreaterThan(1000);
    expect(all.filter((f) => f.startsWith(`${ICONS}/`)).length).toBeGreaterThan(100);
  });

  it('draws no SVG outside src/assets, except the reasoned data-driven list', () => {
    const found = outside
      .filter((f) => !(f in DATA_DRIVEN))
      .flatMap((f) => svgFindings(readFileSync(join(ROOT, f), 'utf8'), f).map((x) => `${f}:${x}`));
    expect(found, 'move the drawing to src/assets (docs/conventions.md#assets)').toEqual([]);
  });

  it('keeps the data-driven list reasoned and every entry still needed', () => {
    for (const [file, why] of Object.entries(DATA_DRIVEN)) {
      expect(why.length, file).toBeGreaterThan(30);
      expect(svgFindings(readFileSync(join(ROOT, file), 'utf8'), file).length, `${file} no longer draws SVG`).toBeGreaterThan(0);
    }
    expect(Object.keys(DATA_DRIVEN)).toEqual([]);
  });

  it('defines no ...Icon component outside src/assets/icons', () => {
    const found = all
      .filter((f) => /\.(tsx|ts)$/.test(f) && !f.startsWith(`${ICONS}/`) && f !== BRAND_ICON)
      .flatMap((f) => iconComponentsDefined(readFileSync(join(ROOT, f), 'utf8'), f).map((n) => `${f}: ${n}`));
    expect(found).toEqual([]);
  });

  it('holds only icon files in src/assets/icons, all listed in its barrel', () => {
    const iconFiles = all.filter((f) => f.startsWith(`${ICONS}/`));
    const problems = iconFiles.map((f) => iconFileProblem(readFileSync(join(ROOT, f), 'utf8'), f)).filter(Boolean);
    expect(problems).toEqual([]);
    const barrel = readFileSync(join(ROOT, ICONS, 'index.ts'), 'utf8');
    const missing = iconFiles
      .map((f) => basename(f, '.tsx'))
      .filter((n) => n.endsWith('Icon'))
      .filter((n) => !barrel.includes(`export { default as ${n} } from './${n}';`));
    expect(missing).toEqual([]);
  });

  it('draws each icon once', () => {
    const sources = Object.fromEntries(
      all.filter((f) => f.startsWith(`${ICONS}/`) && f.endsWith('Icon.tsx')).map((f) => [f, readFileSync(join(ROOT, f), 'utf8')]),
    );
    expect(duplicateDrawings(sources)).toEqual([]);
  });
});

describe('the assets rule bites', () => {
  const real = (f: string) => readFileSync(join(ROOT, f), 'utf8');

  it('on an inline <svg>, a stray shape, svg markup in a string and a data URI in CSS', () => {
    const file = 'src/components/media/library/MediaThumb.tsx';
    expect(svgFindings(real(file), file)).toEqual([]);
    const pasted = real(file).replace('return (', 'return (<svg viewBox="0 0 24 24"><path d="m3 3 18 18" /></svg>) || (');
    expect(svgFindings(pasted, file).map((x) => x.split(': ')[1])).toEqual(['<svg>', '<path>']);
    expect(svgFindings('export const X = () => <span><circle r="2" /></span>;', 'src/app/X.tsx')).toHaveLength(1);
    expect(svgFindings("export const BADGE = '<svg viewBox=\"0 0 24 24\"></svg>';", 'src/utils/x/badge.ts')).toHaveLength(1);
    expect(svgFindings('.a { background: url("data:image/svg+xml;utf8,<svg xmlns=\'x\'/>"); }', 'src/app/x.css')).toHaveLength(1);
    expect(svgFindings('/* <svg> in a comment */ .a { color: red; }', 'src/app/x.css')).toEqual([]);
    expect(svgFindings('// <svg> named in a comment\nexport const X = () => <div title="svg" />;', 'src/app/X.tsx')).toEqual([]);
  });

  it('on an ...Icon component defined outside the icons folder', () => {
    expect(iconComponentsDefined('export function MembersIcon() { return null; }', 'src/components/admin/MembersIcon.tsx')).toEqual(['MembersIcon']);
    expect(iconComponentsDefined('const LockIcon = () => null;\nexport const LOCK = 1;', 'src/app/x.tsx')).toEqual(['LockIcon']);
    expect(iconComponentsDefined('export function HelpTopicBadge() { return null; }', 'src/app/x.tsx')).toEqual([]);
  });

  it('on a stray file in the icons folder, and on an icon not drawn on IconSvg', () => {
    expect(iconFileProblem('export const x = 1;', `${ICONS}/helpers.ts`)).toMatch(/not an icon file/);
    expect(iconFileProblem('export default function Close() { return null; }', `${ICONS}/CloseIcon.tsx`)).toMatch(/does not default-export/);
    expect(iconFileProblem('export default function CloseIcon() { return <svg />; }', `${ICONS}/CloseIcon.tsx`)).toMatch(/IconSvg/);
    expect(iconFileProblem(real(`${ICONS}/CloseIcon.tsx`), `${ICONS}/CloseIcon.tsx`)).toBeNull();
  });

  it('on a second icon file drawing the same thing, whatever its name or attribute order', () => {
    const close = real(`${ICONS}/CloseIcon.tsx`);
    const copy = close.replace(/CloseIcon/g, 'XMarkIcon');
    expect(duplicateDrawings({ [`${ICONS}/CloseIcon.tsx`]: close, [`${ICONS}/XMarkIcon.tsx`]: copy })).toEqual(['CloseIcon.tsx = XMarkIcon.tsx']);
    const reordered = '<IconSvg><circle r="3" cy="12" cx="12" /></IconSvg>';
    expect(drawingOf(reordered, 'a.tsx')).toBe(drawingOf('<IconSvg><circle cx="12" cy="12" r="3" /></IconSvg>', 'b.tsx'));
    const plus = real(`${ICONS}/PlusIcon.tsx`);
    expect(duplicateDrawings({ [`${ICONS}/CloseIcon.tsx`]: close, [`${ICONS}/PlusIcon.tsx`]: plus })).toEqual([]);
  });
});
