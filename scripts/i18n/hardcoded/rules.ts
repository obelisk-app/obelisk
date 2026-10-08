/**
 * Where user-visible text hides, as patterns over comment-stripped source.
 * Each rule yields candidate strings with their offsets; `scanFile` runs
 * them through `looksLikeProse` and the `i18n-exempt:` line marker.
 *
 *  1. `jsxText`: text between tags, `<p>No messages yet</p>`, read from the
 *     syntax tree in `jsx-text.ts` so a paragraph that wraps lines, or is
 *     split by `{' '}`, `<strong>` or `<a>`, is one candidate.
 *  2. `attr`: a quoted reader-facing attribute, `title="Remove"`. A plain
 *     string given to any other prop (`subtitle="..."`, `heading={'...'}`)
 *     is read from the syntax tree in `jsx-attrs.ts` (rule `jsxAttr`).
 *  3. `attrExpr`: any literal inside such an attribute's braces,
 *     `aria-label={muted ? 'Unmute' : 'Mute'}`, templates included.
 *  4. `objectCopy`: a copy-shaped object key, `{ label: 'Add relay' }`
 *     (`name:` only with a space in the value, so ids are left alone).
 *  5. `callArg`: literals passed to the calls that show text:
 *     toasts, confirm dialogs, `setError`, `alert`, `new Notification`,
 *     and `document.title = '...'`.
 *  6. `ternary`: `cond ? 'Online' : 'Offline'`.
 *  7. `fallback`: `name || 'Anonymous'`, `x ?? 'Untitled'`.
 *  8. `template`: a template literal with a capitalised multi-word segment,
 *     `${n} messages, Updated ${when}` (not a `t()` argument, not a path).
 *  9. `libLiteral` (src/lib only): any prose literal. A mini-package
 *     exports codes and the app translates them; errors and logs excepted.
 */

export type Candidate = {
  readonly text: string;
  readonly index: number;
  readonly rule: string;
  /** What is judged as prose, when it differs from `text` (JSX runs drop their `{…}`). */
  readonly probe?: string;
  /** Zero-based first and last line an `i18n-exempt:` marker may sit on; the finding's own line otherwise. */
  readonly span?: readonly [number, number];
};

const READ_ATTRS = 'placeholder|title|aria-label|alt|label|aria-description';
const ATTR = new RegExp(`\\b(?:${READ_ATTRS})\\s*=\\s*"([^"]{2,})"`, 'g');
const ATTR_EXPR = new RegExp(`\\b(?:${READ_ATTRS})\\s*=\\s*\\{`, 'g');
const JSX_TEXT = />\s*([A-Za-z][^<>{}\n]{1,120}?)\s*</g;
const OBJECT_KEYS = 'label|title|description|desc|hint|placeholder|body|message|subtitle|heading|caption|alt|tooltip|summary|error|reason|detail|name';
const OBJECT_COPY = new RegExp(`(?:^|[\\s,{(])(${OBJECT_KEYS})\\s*:\\s*(['"])(.+?)\\2`, 'gm');
const CALLS = /\b(?:pushToast|pushErrorToast|confirmDialog|confirm|alert|setError|setStatus|setMessage|setHint|setJoinError|notify|new Notification)\s*\(/g;
const DOC_TITLE = /document\.title\s*=\s*(['"`])([^'"`]+)\1/g;
const TERNARY = /\?\s*(['"])([^'"\n]{3,})\1\s*:\s*(['"])([^'"\n]{3,})\3/g;
const FALLBACK = /(?:\|\||\?\?)\s*(['"])([^'"\n]{3,})\1/g;
const TEMPLATE = /`([^`]*)`/g;
const LITERAL = /(['"])((?:\\.|(?!\1)[^\\\n])*)\1|`((?:\\.|[^`\\])*)`/g;
/** A literal on one of these lines is for developers, not readers. */
const DEV_LINE = /\b(?:Error|reject|throw|console\.\w+|import|require)\b|\bfrom\s*['"]/;
/** Class names come in ternaries and templates too; they are not copy. */
const CLASS_CONTEXT = /\b(?:className|class|classes|cn|clsx|tw)\s*[=(:]/;

function lineOf(source: string, index: number): string {
  const start = source.lastIndexOf('\n', index - 1) + 1;
  const end = source.indexOf('\n', index);
  return source.slice(start, end === -1 ? source.length : end);
}

/** The text of the line up to `index`. */
function lineBefore(source: string, index: number): string {
  return source.slice(source.lastIndexOf('\n', index - 1) + 1, index);
}

/** The text between `open` (an index just past a bracket) and its matching close. */
function balanced(source: string, open: number, openChar: string, closeChar: string): string {
  let depth = 1;
  let i = open;
  for (; i < source.length && depth > 0; i++) {
    if (source[i] === openChar) depth++;
    else if (source[i] === closeChar) depth--;
  }
  return source.slice(open, i - 1);
}

/** Every string literal (template segments split on `${}`) inside `chunk`, offset by `base`. */
function literalsIn(chunk: string, base: number, rule: string): Candidate[] {
  const out: Candidate[] = [];
  for (const m of chunk.matchAll(LITERAL)) {
    const text = m[2] ?? m[3] ?? '';
    for (const part of text.split(/\$\{[^}]*\}/)) out.push({ text: part, index: base + (m.index ?? 0), rule });
  }
  return out;
}

export function candidates(source: string, file: { isLib: boolean; isTsx: boolean }): Candidate[] {
  const out: Candidate[] = [];
  const add = (text: string, index: number, rule: string) => out.push({ text, index, rule });
  const inClassContext = (index: number) => CLASS_CONTEXT.test(lineBefore(source, index));

  if (file.isLib) {
    for (const m of source.matchAll(LITERAL)) {
      if (DEV_LINE.test(lineOf(source, m.index ?? 0))) continue;
      add(m[2] ?? m[3] ?? '', m.index ?? 0, 'libLiteral');
    }
    return out;
  }
  // `.ts` has no JSX; there the pattern only ever matches generics. In
  // `.tsx` the syntax tree (`jsx-text.ts`) reads JSX text; this regex stays
  // for markup the tree does not see as JSX (HTML in a string), and
  // `scanFile` drops its matches that fall inside a JSX text node.
  if (file.isTsx) for (const m of source.matchAll(JSX_TEXT)) add(m[1], (m.index ?? 0) + m[0].indexOf(m[1]), 'jsxText');
  for (const m of source.matchAll(ATTR)) add(m[1], m.index ?? 0, 'attr');
  for (const m of source.matchAll(ATTR_EXPR)) {
    const start = (m.index ?? 0) + m[0].length;
    out.push(...literalsIn(balanced(source, start, '{', '}'), start, 'attrExpr'));
  }
  for (const m of source.matchAll(OBJECT_COPY)) {
    if (m[1] === 'name' && !m[3].includes(' ')) continue;
    add(m[3], m.index ?? 0, 'objectCopy');
  }
  for (const m of source.matchAll(CALLS)) {
    const start = (m.index ?? 0) + m[0].length;
    out.push(...literalsIn(balanced(source, start, '(', ')'), start, 'callArg'));
  }
  for (const m of source.matchAll(DOC_TITLE)) add(m[2], m.index ?? 0, 'callArg');
  for (const m of source.matchAll(TERNARY)) {
    if (inClassContext(m.index ?? 0)) continue;
    add(m[2], m.index ?? 0, 'ternary');
    add(m[4], m.index ?? 0, 'ternary');
  }
  for (const m of source.matchAll(FALLBACK)) add(m[2], m.index ?? 0, 'fallback');
  for (const m of source.matchAll(TEMPLATE)) {
    const before = source.slice(Math.max(0, (m.index ?? 0) - 3), m.index ?? 0);
    if (/\bt\($|\.t\($/.test(before) || inClassContext(m.index ?? 0)) continue;
    for (const part of m[1].split(/\$\{[^}]*\}/)) {
      if (/[/=]/.test(part)) continue;
      if (/[A-Z][a-z]+\s+\w+/.test(part)) add(part, m.index ?? 0, 'template');
    }
  }
  return out;
}
