/**
 * String props, read from the TypeScript syntax tree.
 *
 * The regex rules read six attribute names (`title`, `label`,
 * `placeholder`, `alt`, `aria-label`, `aria-description`). Copy handed to a
 * custom component under any other name (`<SettingRow subtitle="...">`,
 * `description`, `emptyText`, `confirmLabel`, `heading={'...'}`) passed
 * unseen. Here every JSX attribute whose value is a plain string is a
 * candidate: `x="..."`, `x={'...'}`, or `x={`...`}` with no substitutions.
 * Anything computed (a `t()` call, a variable, a ternary) is left to the
 * other rules.
 *
 * The attributes below never hold reader-facing text, so they are skipped
 * by name. Most of their values (`primary`, `button`, `_blank`) would fail
 * the prose check anyway; the list exists for the ones that would not.
 * Each group is there for a value the repo actually has.
 */

import ts from 'typescript';
import type { Candidate } from './rules';

export const SKIP_ATTRS: ReadonlySet<string> = new Set([
  // Styling and identity: "screen active" is a class list without a dash.
  'className', 'class', 'style', 'id', 'key', 'testId',
  // Where a resource lives, or what an iframe may do (`allow="autoplay; ..."`).
  'href', 'src', 'srcSet', 'allow',
  // HTML enumerations and form plumbing: `rel="noopener noreferrer"`.
  'type', 'name', 'role', 'rel', 'target', 'method', 'as', 'htmlFor', 'autoComplete', 'inputMode', 'lang', 'dir',
  // The design system's variant props (`Button`, `Badge`, `Callout`).
  'variant', 'size', 'tone',
  // SVG geometry: path data ("M19 6l-1 14a2 2 0 01-2 2H8") reads as prose.
  'd', 'path', 'transform', 'preserveAspectRatio',
]);

/** `data-*` (including `data-testid`) and event handlers (`onClick`, `onConfirm`). */
const SKIP_PATTERN = /^data-|^on[A-Z]/;

export function isReaderFacing(name: string): boolean {
  return !SKIP_ATTRS.has(name) && !SKIP_PATTERN.test(name);
}

/** The string an attribute is given, or `undefined` when it is computed. */
function stringOf(init: ts.JsxAttributeValue | undefined): ts.StringLiteral | ts.NoSubstitutionTemplateLiteral | undefined {
  if (!init) return undefined;
  if (ts.isStringLiteral(init)) return init;
  if (!ts.isJsxExpression(init) || !init.expression) return undefined;
  let expr = init.expression;
  while (ts.isParenthesizedExpression(expr)) expr = expr.expression;
  return ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr) ? expr : undefined;
}

const lineOf = (sf: ts.SourceFile, pos: number) => sf.getLineAndCharacterOfPosition(pos).line;

/**
 * Every plain-string value of a reader-facing JSX attribute. A candidate
 * sits at its string (so the finding's line is the text's line) and its
 * `span` runs from the attribute's name to the string's end, so an
 * `i18n-exempt:` marker on either line covers it and a sibling prop's
 * marker does not.
 */
export function scanJsxAttrs(sf: ts.SourceFile): Candidate[] {
  const out: Candidate[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node) && isReaderFacing(node.name.getText(sf))) {
      const literal = stringOf(node.initializer);
      if (literal) {
        const index = literal.getStart(sf) + 1;
        const span = [lineOf(sf, node.getStart(sf)), lineOf(sf, literal.getEnd())] as const;
        out.push({ text: literal.text, index, rule: 'jsxAttr', span });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}
