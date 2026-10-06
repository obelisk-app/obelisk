/**
 * JSX text, read from the TypeScript syntax tree rather than a regex.
 *
 * The line regex this replaces only saw text that sat on one line between
 * a `>` and a `<`. It missed a paragraph that wraps across lines, text
 * broken by `{' '}`, text that goes on after an inline `<strong>` or `<a>`,
 * text beside an `{expression}`, and text that starts with a digit or a
 * quote. That is how an English paragraph reached `/voice` with a baseline
 * of zero.
 *
 * Here the children of every element are grouped into runs, the way a
 * reader sees them: text, string-literal expressions (`{' '}`, `{"or"}`)
 * and inline elements (`<strong>`, `<a>`, `<Link>`, `<br />`) join one
 * run; any other expression or component stands in as `{…}`; a block
 * element (`<div>`, `<p>`, `<li>`) ends the run. Each run is one candidate,
 * whitespace collapsed, reported at its first line. Its `span` covers every
 * line the run occupies (plus the parent's opening tag), so an
 * `i18n-exempt:` marker on any of them applies to the whole run.
 */

import ts from 'typescript';
import type { Candidate } from './rules';

/** Elements that flow inside a sentence; their text joins the run around them. */
const INLINE = new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'code', 'data', 'del', 'dfn', 'em', 'i', 'ins',
  'kbd', 'mark', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var',
  'wbr', 'Link',
]);

/** What an expression child is drawn as inside a run. */
export const PLACEHOLDER = '{…}';

type Piece = { text: string; start: number; end: number; literal: boolean };

function tagName(node: ts.JsxElement | ts.JsxSelfClosingElement): string {
  const tag = ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName;
  return tag.getText();
}

function isInline(node: ts.Node): node is ts.JsxElement | ts.JsxSelfClosingElement {
  return (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) && INLINE.has(tagName(node));
}

/** A string literal or a template with no substitutions: `{' '}`, `{"or"}`. */
function literalOf(expr: ts.Expression | undefined): string | undefined {
  if (!expr) return undefined;
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text;
  if (ts.isParenthesizedExpression(expr)) return literalOf(expr.expression);
  return undefined;
}

/**
 * The pieces a child contributes to a run, or `undefined` when it ends the
 * run. Inline elements are flattened and recorded in `flattened` so the
 * walk does not report their text a second time.
 */
function piecesOf(child: ts.JsxChild, sf: ts.SourceFile, flattened: Set<ts.Node>): Piece[] | undefined {
  const at = (text: string, literal: boolean): Piece[] => [{ text, start: child.getStart(sf), end: child.getEnd(), literal }];
  if (ts.isJsxText(child)) {
    const lead = Math.max(0, child.text.search(/\S/));
    return [{ text: child.text, start: child.pos + lead, end: child.getEnd(), literal: true }];
  }
  if (ts.isJsxExpression(child)) {
    if (!child.expression) return at('', true); // a {/* comment */}: transparent
    const literal = literalOf(child.expression);
    return literal === undefined ? at(` ${PLACEHOLDER} `, false) : at(literal, true);
  }
  if (isInline(child)) {
    flattened.add(child);
    if (ts.isJsxSelfClosingElement(child)) return at(' ', true);
    const inner: Piece[] = [];
    for (const c of child.children) {
      const p = piecesOf(c, sf, flattened);
      inner.push(...(p ?? at(` ${PLACEHOLDER} `, false)));
    }
    return inner.length > 0 ? inner : at('', true);
  }
  if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
    // A component inside a sentence (`<Kbd>`, `<Npub />`) holds its place;
    // a block element ends the sentence.
    return /^[A-Z]/.test(tagName(child)) ? at(` ${PLACEHOLDER} `, false) : undefined;
  }
  return undefined;
}

function lineOf(sf: ts.SourceFile, pos: number): number {
  return sf.getLineAndCharacterOfPosition(pos).line;
}

/** Collapse whitespace the way JSX renders it. */
const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();

function emitRun(run: Piece[], opening: number, sf: ts.SourceFile, out: JsxCandidate[]): void {
  const text = collapse(run.map((p) => p.text).join(''));
  const probe = collapse(text.split(PLACEHOLDER).join(' '));
  if (!probe) return;
  const first = run.find((p) => p.literal && p.text.trim()) ?? run[0];
  const end = run[run.length - 1].end;
  const index = first.start;
  out.push({ text, probe, index, rule: 'jsxText', span: [Math.min(opening, lineOf(sf, index)), lineOf(sf, end)] });
}

export type JsxCandidate = Candidate & {
  /** The run's text with placeholders dropped, which is what is judged as prose. */
  readonly probe: string;
  /** First and last zero-based line the run (and its parent's opening tag) occupies. */
  readonly span: readonly [number, number];
};

export type JsxScan = {
  readonly candidates: JsxCandidate[];
  /** Character ranges of every JSX text node, so the line regex does not report them twice. */
  readonly ranges: Array<readonly [number, number]>;
};

/** Every run of JSX text in a `.tsx` source, as candidates with their line span. */
export function scanJsxText(source: string, fileName = 'x.tsx'): JsxScan {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const flattened = new Set<ts.Node>();
  const candidates: JsxCandidate[] = [];
  const ranges: Array<readonly [number, number]> = [];

  const scanChildren = (children: ts.NodeArray<ts.JsxChild>, opening: number) => {
    let run: Piece[] = [];
    for (const child of children) {
      const pieces = piecesOf(child, sf, flattened);
      if (pieces) { run.push(...pieces); continue; }
      if (run.length > 0) emitRun(run, opening, sf, candidates);
      run = [];
    }
    if (run.length > 0) emitRun(run, opening, sf, candidates);
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) ranges.push([node.pos, node.end]);
    if (ts.isJsxElement(node) && !flattened.has(node)) {
      scanChildren(node.children, lineOf(sf, node.openingElement.getStart(sf)));
    } else if (ts.isJsxFragment(node)) {
      scanChildren(node.children, lineOf(sf, node.openingFragment.getStart(sf)));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { candidates, ranges };
}
