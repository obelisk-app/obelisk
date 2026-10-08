/**
 * What each layer may hold, read from the TypeScript syntax tree
 * (docs/ui/conventions.md#what-each-layer-holds):
 *
 *   src/constants/  values and types only: no function of any kind, no class,
 *                   no JSX, and no value imported from an app layer (other
 *                   constants, lib packages and npm packages only)
 *   src/hooks/      hooks (`use*`) and their own types: every value it
 *                   exports is a hook
 *   src/utils/      pure functions: no React or Next.js, no import from the
 *                   app layers that hold state or effects (hooks, services,
 *                   store, components, app), and no storage, network or
 *                   timer global
 *   src/services/   business logic and side effects
 *
 * and, across utils, services and hooks, the one rule for constants:
 * a constant another file reads lives in `src/constants/<module>/`; a
 * constant only its own file reads stays there, unexported. So no file in
 * those layers exports a constant value (a literal, or an object, array,
 * Set or Map of literals), and a file that would be nothing but constants
 * is a constants file in the wrong layer.
 */

import ts from 'typescript';

export const LAYER_ROOTS = ['src/constants', 'src/hooks', 'src/utils', 'src/services'] as const;

/** Modules a pure helper may not import values from. */
const IMPURE_IMPORT = /^(react|react-dom|zustand)(\/|$)|^next(\/|$)|^@\/(hooks|services|store|components|app)(\/|$)/;
/** Globals that reach storage, the network or a timer. */
const IMPURE_GLOBALS = new Set([
  'localStorage', 'sessionStorage', 'indexedDB', 'caches',
  'fetch', 'WebSocket', 'XMLHttpRequest', 'EventSource', 'RTCPeerConnection',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
  'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback',
]);
const GLOBAL_OBJECTS = new Set(['window', 'globalThis', 'self']);
const HOOK = /^use[A-Z0-9]/;

function layerOf(file: string): (typeof LAYER_ROOTS)[number] | undefined {
  return LAYER_ROOTS.find((root) => file.startsWith(`${root}/`));
}

const unwrap = (e: ts.Expression): ts.Expression =>
  ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isTypeAssertionExpression(e)
    ? unwrap(e.expression)
    : e;

/** `MAX_ROWS`, `KINDS`: a name written the way a constant is. */
const CONSTANT_NAME = /^[A-Z][A-Z0-9_]*$/;
/** Built-ins whose properties are constants (`Number.MAX_SAFE_INTEGER`). */
const CONSTANT_ROOTS = new Set(['Number', 'Math']);

const NONE: ReadonlySet<string> = new Set();

/**
 * `KIND`, `KIND.X`, `Number.MAX_SAFE_INTEGER`, `process.env.X`: a reference
 * to another constant, or to build configuration. A name imported from a
 * layer that holds logic or state (`foreign`) is not one: a list built from
 * a service's values belongs with that service.
 */
function isConstantReference(e: ts.Expression, foreign: ReadonlySet<string>): boolean {
  if (ts.isIdentifier(e)) {
    if (foreign.has(e.text)) return false;
    return CONSTANT_NAME.test(e.text) || e.text === 'undefined' || e.text === 'Infinity';
  }
  if (ts.isPropertyAccessExpression(e)) {
    let root: ts.Expression = e;
    while (ts.isPropertyAccessExpression(root)) root = root.expression;
    if (!ts.isIdentifier(root) || foreign.has(root.text)) return false;
    if (root.text === 'process') return /^process\.env\.[A-Z0-9_]+$/.test(e.getText());
    return CONSTANT_NAME.test(root.text) || CONSTANT_ROOTS.has(root.text);
  }
  return false;
}

/** Value imports from where a constant may come from: the constants layer, a lib package, an npm package. */
function constantSource(spec: string): boolean {
  return !spec.startsWith('.') && (!spec.startsWith('@/') || /^@\/(constants|lib)\//.test(spec));
}

/** Names a file imports as values from modules that hold logic or state. */
function foreignNames(sf: ts.SourceFile): Set<string> {
  const out = new Set<string>();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !st.importClause || st.importClause.isTypeOnly) continue;
    if (constantSource((st.moduleSpecifier as ts.StringLiteral).text)) continue;
    const c = st.importClause;
    if (c.name) out.add(c.name.text);
    if (c.namedBindings && ts.isNamespaceImport(c.namedBindings)) out.add(c.namedBindings.name.text);
    if (c.namedBindings && ts.isNamedImports(c.namedBindings)) {
      for (const el of c.namedBindings.elements) if (!el.isTypeOnly) out.add(el.name.text);
    }
  }
  return out;
}

/**
 * A value written out in the source: literals, references to other
 * constants, and objects, arrays, Sets and Maps of them. A call, a function,
 * an empty `{}` or `new Map()` (state, not a constant) is not one.
 */
export function isLiteralValue(node: ts.Expression, foreign: ReadonlySet<string> = NONE): boolean {
  const lit = (x: ts.Expression) => isLiteralValue(x, foreign);
  const e = unwrap(node);
  if (ts.isStringLiteral(e) || ts.isNumericLiteral(e) || ts.isBigIntLiteral(e)
    || ts.isNoSubstitutionTemplateLiteral(e) || ts.isRegularExpressionLiteral(e)) return true;
  if ([ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(e.kind)) return true;
  if (ts.isIdentifier(e) || ts.isPropertyAccessExpression(e)) return isConstantReference(e, foreign);
  if (ts.isPrefixUnaryExpression(e)) return lit(e.operand);
  if (ts.isBinaryExpression(e)) return lit(e.left) && lit(e.right); // `5 * 60_000`, `process.env.X || 'y'`
  if (ts.isTemplateExpression(e)) return e.templateSpans.every((s) => lit(s.expression));
  if (ts.isArrayLiteralExpression(e)) {
    return e.elements.every((x) => ts.isOmittedExpression(x) || lit(ts.isSpreadElement(x) ? x.expression : x));
  }
  if (ts.isObjectLiteralExpression(e)) {
    // `{}` is a bag something fills in later, not a constant.
    return e.properties.length > 0 && e.properties.every((p) =>
      (ts.isPropertyAssignment(p) && lit(p.initializer))
      || (ts.isShorthandPropertyAssignment(p) && CONSTANT_NAME.test(p.name.text) && !foreign.has(p.name.text))
      || (ts.isSpreadAssignment(p) && lit(p.expression)));
  }
  if (ts.isNewExpression(e) && ts.isIdentifier(e.expression) && ['Set', 'Map'].includes(e.expression.text)) {
    return (e.arguments ?? []).length > 0 && (e.arguments ?? []).every(lit);
  }
  if (ts.isCallExpression(e) && e.expression.getText() === 'Object.freeze') return e.arguments.every(lit);
  return false;
}

function exported(node: ts.Node): boolean {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

function isFunctionLike(node: ts.Node): boolean {
  return ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)
    || ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)
    || ts.isClassDeclaration(node) || ts.isClassExpression(node);
}

function isJsx(node: ts.Node): boolean {
  return ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node);
}

/** A value import (not `import type`, not only type specifiers). */
function importsValues(decl: ts.ImportDeclaration): boolean {
  const clause = decl.importClause;
  if (!clause) return true; // a side-effect import
  if (clause.isTypeOnly) return false;
  if (clause.name) return true;
  const bindings = clause.namedBindings;
  if (!bindings) return false;
  if (ts.isNamespaceImport(bindings)) return true;
  return bindings.elements.some((el) => !el.isTypeOnly);
}

/** Names a file declares or imports, so a local `fetch` parameter is not the global. */
function declaredNames(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  const visit = (node: ts.Node): void => {
    if ((ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isFunctionDeclaration(node)
      || ts.isImportSpecifier(node) || ts.isImportClause(node) || ts.isNamespaceImport(node)
      || ts.isBindingElement(node)) && node.name && ts.isIdentifier(node.name)) names.add(node.name.text);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return names;
}

/** A use of a storage, network or timer global: `fetch(...)`, `window.localStorage`, `globalThis.setTimeout`. */
function impureGlobalAt(node: ts.Identifier, local: Set<string>): boolean {
  if (!IMPURE_GLOBALS.has(node.text)) return false;
  const parent = node.parent;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) {
    return ts.isIdentifier(parent.expression) && GLOBAL_OBJECTS.has(parent.expression.text);
  }
  if ((ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent) || ts.isPropertySignature(parent)) && parent.name === node) {
    return false;
  }
  if (ts.isTypeReferenceNode(parent) || ts.isTypeQueryNode(parent) || ts.isQualifiedName(parent)) return false;
  return !local.has(node.text);
}

/** The exported values of a module, by name, with the node that defines each. */
function exportedValues(sf: ts.SourceFile): Array<{ name: string; node: ts.Node; init?: ts.Expression }> {
  const out: Array<{ name: string; node: ts.Node; init?: ts.Expression }> = [];
  for (const st of sf.statements) {
    if (ts.isVariableStatement(st) && exported(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) out.push({ name: d.name.text, node: d, init: d.initializer });
      }
    } else if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isEnumDeclaration(st)) && exported(st)) {
      out.push({ name: st.name?.text ?? 'default', node: st });
    } else if (ts.isExportAssignment(st)) {
      out.push({ name: ts.isIdentifier(st.expression) ? st.expression.text : 'default', node: st, init: st.expression });
    } else if (ts.isExportDeclaration(st) && !st.isTypeOnly) {
      if (!st.exportClause) out.push({ name: '*', node: st });
      else if (ts.isNamedExports(st.exportClause)) {
        for (const el of st.exportClause.elements) if (!el.isTypeOnly) out.push({ name: el.name.text, node: el });
      }
    }
  }
  return out;
}

const isFunctionValue = (init: ts.Expression | undefined) =>
  !!init && (ts.isArrowFunction(unwrap(init)) || ts.isFunctionExpression(unwrap(init)));

/** True for a file that is nothing but constants (and types): it belongs in `src/constants/`. */
export function isConstantsOnly(sf: ts.SourceFile): boolean {
  const foreign = foreignNames(sf);
  let values = 0;
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) || ts.isTypeAliasDeclaration(st) || ts.isInterfaceDeclaration(st)) continue;
    if (ts.isExportDeclaration(st) && st.isTypeOnly) continue;
    if (!ts.isVariableStatement(st)) return false;
    for (const d of st.declarationList.declarations) {
      if (!d.initializer || !isLiteralValue(d.initializer, foreign)) return false;
      if (exported(st)) values += 1;
    }
  }
  return values > 0;
}

/** Every way one source file breaks its layer's rule, one line each. */
export function layerProblems(file: string, source: string): string[] {
  const layer = layerOf(file);
  if (!layer || file.endsWith('.d.ts')) return [];
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const line = (node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const problems: string[] = [];
  const add = (node: ts.Node, what: string) => problems.push(`${file}:${line(node)}: ${what}`);

  if (layer === 'src/constants') {
    const walk = (node: ts.Node): void => {
      if (isFunctionLike(node)) add(node, 'a function or class in a constants file');
      else if (isJsx(node)) add(node, 'JSX in a constants file');
      else ts.forEachChild(node, walk);
    };
    walk(sf);
    for (const st of sf.statements) {
      if (ts.isImportDeclaration(st) && importsValues(st)) {
        const from = (st.moduleSpecifier as ts.StringLiteral).text;
        if (!constantSource(from) && !from.startsWith('.')) add(st, `a value imported from an app layer (${from}): a constant reads only other constants and lib packages`);
      }
    }
    return problems;
  }

  if (layer === 'src/hooks') {
    for (const { name, node } of exportedValues(sf)) {
      if (!HOOK.test(name)) add(node, `exports ${name}, which is not a hook`);
    }
    return problems;
  }

  // utils and services: a constants-only file, or an exported constant.
  if (isConstantsOnly(sf)) {
    add(sf.statements.find((st) => ts.isVariableStatement(st)) ?? sf, 'only constants: the file belongs in src/constants/');
  } else {
    const foreign = foreignNames(sf);
    for (const { name, node, init } of exportedValues(sf)) {
      if (ts.isVariableDeclaration(node) && init && !isFunctionValue(init) && isLiteralValue(init, foreign)) {
        add(node, `exports the constant ${name}: it belongs in src/constants/ (or unexported, if only this file reads it)`);
      }
    }
  }

  if (layer === 'src/utils') {
    for (const st of sf.statements) {
      if (ts.isImportDeclaration(st) && importsValues(st)) {
        const from = (st.moduleSpecifier as ts.StringLiteral).text;
        if (IMPURE_IMPORT.test(from)) add(st, `imports ${from}: a helper in utils is pure`);
      }
    }
    const local = declaredNames(sf);
    const walk = (node: ts.Node): void => {
      if (ts.isIdentifier(node) && impureGlobalAt(node, local)) add(node, `uses ${node.text}: storage, network and timers belong in services`);
      if (isJsx(node)) add(node, 'JSX in utils: a component belongs in src/components/');
      ts.forEachChild(node, walk);
    };
    walk(sf);
  }
  return problems;
}
