/**
 * The markup-only rule, read from the TypeScript syntax tree.
 *
 * A component file is markup: one component, its state and handlers from a
 * view-model hook (`src/hooks/<module>/use<Component>.ts`), its data from
 * bridge and store hooks. This module counts what does not belong in one,
 * per file, in six kinds (docs/conventions.md#component-files):
 *
 *   effects     a call to useEffect, useLayoutEffect, useInsertionEffect or
 *               useImperativeHandle
 *   memos       a call to useMemo or useCallback
 *   reducers    a call to useReducer
 *   state       each useState / useRef past the second in one component
 *   functions   a function with logic (below), at the top level or nested
 *   components  each component past the first in the file
 *
 * A function has no logic, and is allowed inside a component, when it is an
 * arrow (never the `function` keyword) whose body is one plain expression,
 * or a block holding at most one statement that evaluates or returns one.
 * Plain means: literals, names, property reads, calls whose arguments are
 * plain, `!x`, `x as T`, `x!`, `await x`, templates of plain parts, object
 * and array literals of plain values, JSX (its own children are checked as
 * markup, not as logic) and further arrows of this kind. A conditional, an
 * operator (`&&`, `===`, `+`, `=` ...), `new`, a second statement, a local
 * declaration, `if` / `for` / `try` make it logic. So
 * `onClick={() => vm.kick(row)}`, `onChange={(e) => vm.setFilter(e.target.value)}`
 * and `rows.map((r) => <Row key={r.id} row={r} />)` are markup, and
 * `onClick={() => { setBusy(true); save(); }}` is not.
 *
 * At the top level every non-component function counts (a helper belongs in
 * `src/utils/` or `src/services/`), except a markup factory: a function that
 * only returns an object or array literal of plain values, the shape a
 * `columns.tsx` takes. Next.js exports that must live in a route file
 * (`generateMetadata`, `generateStaticParams`, the HTTP handlers, the
 * default export of an image or metadata route) are not counted.
 *
 * The argument of a counted hook (an effect's body, a memo's factory) is not
 * counted again as a function.
 */

import ts from 'typescript';

export type Kind = 'effects' | 'memos' | 'reducers' | 'state' | 'functions' | 'components';
export const KINDS: readonly Kind[] = ['effects', 'memos', 'reducers', 'state', 'functions', 'components'];
export type Counts = Partial<Record<Kind, number>>;

/** One finding: what and where (1-based line). */
export interface Finding { kind: Kind; line: number; what: string }

const HOOK_KIND: Readonly<Record<string, Kind>> = {
  useEffect: 'effects',
  useLayoutEffect: 'effects',
  useInsertionEffect: 'effects',
  useImperativeHandle: 'effects',
  useMemo: 'memos',
  useCallback: 'memos',
  useReducer: 'reducers',
};
const LOCAL_STATE = new Set(['useState', 'useRef']);
/** `useState` and `useRef` calls one component may keep for purely visual state. */
export const LOCAL_STATE_CAP = 2;

/** A function named like a component: `Panel`, `MenuItem`, and the MDX map's `H2`, `UL`, `A`. */
const PASCAL = /^[A-Z]/;
/** Wrappers whose function argument is the component: `memo(function Row() {})`. */
const COMPONENT_WRAPPERS = new Set(['memo', 'forwardRef']);

/** Next.js names a route module must export as functions. */
const NEXT_REQUIRED = new Set([
  'generateMetadata', 'generateStaticParams', 'generateViewport', 'generateImageMetadata', 'generateSitemaps',
  'GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS',
]);
/** Route files whose default export is a handler Next calls, not a React component. */
const NEXT_HANDLER_DEFAULT = /(^|\/)(opengraph-image|twitter-image|icon|apple-icon|sitemap|robots|manifest|route)\.(tsx?|jsx?)$/;
const NEXT_ROUTE_FILE = /(^|\/)(page|layout|loading|error|global-error|not-found|template|default|route|sitemap|robots|manifest|opengraph-image|twitter-image|icon|apple-icon)\.(tsx?|jsx?)$/;

type FnLike = ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration | ts.MethodDeclaration
  | ts.GetAccessorDeclaration | ts.SetAccessorDeclaration | ts.ConstructorDeclaration;

function isFnLike(node: ts.Node): node is FnLike {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)
    || ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)
    || ts.isConstructorDeclaration(node);
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === kind);
}

/** The hook a call invokes, for `useX(...)` and `React.useX(...)`. */
function hookName(call: ts.CallExpression): string | undefined {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === 'React') {
    return callee.name.text;
  }
  return undefined;
}

/** The function a component binding holds: the arrow itself, or the one inside `memo(...)` / `forwardRef(...)`. */
function componentFunction(init: ts.Expression | undefined): FnLike | undefined {
  if (!init) return undefined;
  if (ts.isParenthesizedExpression(init) || ts.isAsExpression(init) || ts.isSatisfiesExpression(init)) {
    return componentFunction(init.expression);
  }
  if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) return init;
  if (ts.isCallExpression(init)) {
    const name = hookName(init) ?? (ts.isPropertyAccessExpression(init.expression) ? init.expression.name.text : undefined);
    if (name && COMPONENT_WRAPPERS.has(name)) return componentFunction(init.arguments[0]);
  }
  return undefined;
}

/** True for an expression with no logic in it (see the header). */
export function isPlain(node: ts.Node): boolean {
  if (ts.isStringLiteral(node) || ts.isNumericLiteral(node) || ts.isBigIntLiteral(node)
    || ts.isNoSubstitutionTemplateLiteral(node) || ts.isRegularExpressionLiteral(node)) return true;
  if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword
    || node.kind === ts.SyntaxKind.NullKeyword || node.kind === ts.SyntaxKind.ThisKeyword) return true;
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) return true;
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) return true;
  if (ts.isArrowFunction(node)) return isTrivialArrow(node);
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)
    || ts.isSatisfiesExpression(node) || ts.isTypeAssertionExpression(node) || ts.isAwaitExpression(node)
    || ts.isVoidExpression(node) || ts.isSpreadElement(node) || ts.isTypeOfExpression(node)) {
    return isPlain(node.expression);
  }
  if (ts.isPrefixUnaryExpression(node)) {
    const op = node.operator;
    return (op === ts.SyntaxKind.ExclamationToken || op === ts.SyntaxKind.MinusToken || op === ts.SyntaxKind.PlusToken)
      && isPlain(node.operand);
  }
  if (ts.isPropertyAccessExpression(node)) return isPlain(node.expression);
  if (ts.isElementAccessExpression(node)) return isPlain(node.expression) && isPlain(node.argumentExpression);
  if (ts.isCallExpression(node)) {
    const calleeOk = node.expression.kind === ts.SyntaxKind.ImportKeyword || isPlain(node.expression);
    return calleeOk && node.arguments.every(isPlain);
  }
  if (ts.isTemplateExpression(node)) return node.templateSpans.every((s) => isPlain(s.expression));
  if (ts.isArrayLiteralExpression(node)) return node.elements.every((e) => ts.isOmittedExpression(e) || isPlain(e));
  if (ts.isObjectLiteralExpression(node)) {
    return node.properties.every((p) => {
      if (ts.isPropertyAssignment(p)) return isPlain(p.initializer);
      if (ts.isShorthandPropertyAssignment(p)) return true;
      if (ts.isSpreadAssignment(p)) return isPlain(p.expression);
      if (ts.isMethodDeclaration(p)) return isTrivialBlock(p.body);
      return false;
    });
  }
  return false;
}

function isTrivialBlock(body: ts.Block | undefined): boolean {
  if (!body) return true;
  if (body.statements.length === 0) return true;
  if (body.statements.length > 1) return false;
  const only = body.statements[0];
  if (ts.isExpressionStatement(only)) return isPlain(only.expression);
  if (ts.isReturnStatement(only)) return !only.expression || isPlain(only.expression);
  return false;
}

/** An arrow with no logic: one plain expression, or a block of at most one plain statement. */
export function isTrivialArrow(fn: ts.ArrowFunction): boolean {
  return ts.isBlock(fn.body) ? isTrivialBlock(fn.body) : isPlain(fn.body);
}

/** A top-level function that only returns an object or array literal of plain values (`columns.tsx`). */
export function isMarkupFactory(fn: FnLike): boolean {
  const literal = (e: ts.Expression | undefined): boolean => {
    let x = e;
    while (x && (ts.isParenthesizedExpression(x) || ts.isAsExpression(x) || ts.isSatisfiesExpression(x))) x = x.expression;
    return !!x && (ts.isArrayLiteralExpression(x) || ts.isObjectLiteralExpression(x)) && isPlain(x);
  };
  const body = fn.body;
  if (!body) return false;
  if (!ts.isBlock(body)) return literal(body as ts.Expression);
  return body.statements.length === 1 && ts.isReturnStatement(body.statements[0]) && literal(body.statements[0].expression);
}

export interface FileReport { counts: Counts; findings: Finding[] }

/** Count the markup-only findings in one source file. */
export function analyzeSource(source: string, fileName: string): FileReport {
  const kind = /\.(tsx|jsx)$/.test(fileName) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
  const findings: Finding[] = [];
  const add = (k: Kind, node: ts.Node, what: string) =>
    findings.push({ kind: k, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, what });
  const routeFile = NEXT_ROUTE_FILE.test(fileName);
  let components = 0;

  const component = (name: string, fn: FnLike) => {
    components += 1;
    if (components > 1) add('components', fn, name);
    let local = 0;
    const walk = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const hook = hookName(node);
        if (hook && HOOK_KIND[hook]) {
          add(HOOK_KIND[hook], node, hook);
          ts.forEachChild(node.expression, walk);
          return; // its arguments are the hook's own body, counted once as the hook
        }
        if (hook && LOCAL_STATE.has(hook)) {
          local += 1;
          if (local > LOCAL_STATE_CAP) add('state', node, `${hook} #${local}`);
        }
      }
      const nested = nestedComponent(node);
      if (nested) {
        component(nested.name, nested.fn);
        return;
      }
      if (isFnLike(node)) {
        if (ts.isArrowFunction(node) && isTrivialArrow(node)) {
          ts.forEachChild(node, walk);
          return;
        }
        add('functions', node, fnName(node));
        return;
      }
      ts.forEachChild(node, walk);
    };
    if (fn.body) ts.forEachChild(fn.body, walk);
  };

  /** Arrows and methods inside top-level data (`const ICONS = {...}`): logic counts, markup is fine. */
  const data = (node: ts.Node): void => {
    if (isFnLike(node)) {
      if (ts.isArrowFunction(node) && isTrivialArrow(node)) ts.forEachChild(node, data);
      else add('functions', node, fnName(node));
      return;
    }
    ts.forEachChild(node, data);
  };

  const topFunction = (name: string, fn: FnLike, exported: boolean, isDefault: boolean) => {
    if (routeFile && exported && (NEXT_REQUIRED.has(name) || (isDefault && NEXT_HANDLER_DEFAULT.test(fileName)))) return;
    if (PASCAL.test(name) || (isDefault && kind === ts.ScriptKind.TSX)) {
      component(name, fn);
      return;
    }
    if (isMarkupFactory(fn)) {
      if (fn.body) ts.forEachChild(fn.body, data);
      return;
    }
    add('functions', fn, name);
  };

  for (const stmt of sf.statements) {
    const exported = hasModifier(stmt, ts.SyntaxKind.ExportKeyword);
    const isDefault = hasModifier(stmt, ts.SyntaxKind.DefaultKeyword);
    if (ts.isFunctionDeclaration(stmt)) {
      topFunction(stmt.name?.text ?? 'default', stmt, exported, isDefault);
    } else if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        const name = ts.isIdentifier(d.name) ? d.name.text : '';
        const fn = componentFunction(d.initializer);
        if (fn && name) topFunction(name, fn, exported, false);
        else if (d.initializer) data(d.initializer);
      }
    } else if (ts.isExportAssignment(stmt)) {
      const fn = componentFunction(stmt.expression);
      if (fn) topFunction('default', fn, true, true);
      else data(stmt.expression);
    } else if (ts.isClassDeclaration(stmt)) {
      components += 1;
      if (components > 1) add('components', stmt, stmt.name?.text ?? 'class');
    } else if (!ts.isImportDeclaration(stmt) && !ts.isInterfaceDeclaration(stmt) && !ts.isTypeAliasDeclaration(stmt)) {
      data(stmt);
    }
  }

  const counts: Counts = {};
  for (const f of findings) counts[f.kind] = (counts[f.kind] ?? 0) + 1;
  return { counts, findings };
}

/** `function Row()` or `const Row = () => ...` written inside a component. */
function nestedComponent(node: ts.Node): { name: string; fn: FnLike } | undefined {
  if (ts.isFunctionDeclaration(node) && node.name && PASCAL.test(node.name.text)) return { name: node.name.text, fn: node };
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && PASCAL.test(node.name.text)) {
    const fn = componentFunction(node.initializer);
    if (fn) return { name: node.name.text, fn };
  }
  return undefined;
}

function fnName(node: FnLike): string {
  if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) && node.name) return node.name.text;
  if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) return node.name.text;
  const parent = node.parent;
  if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  if (parent && ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  if (parent && ts.isJsxExpression(parent) && ts.isJsxAttribute(parent.parent)) return parent.parent.name.getText();
  return 'inline function';
}

export function total(counts: Counts): number {
  return KINDS.reduce((sum, k) => sum + (counts[k] ?? 0), 0);
}
