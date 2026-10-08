import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * The owner's rule (round 34): forms are built from the common pieces
 * (docs/ui/conventions.md#forms).
 *
 *   the element  `Form` (`src/components/ui/forms/Form.tsx`): no raw `<form>`
 *                in JSX under `src/components/` or `src/app/` outside the ui kit
 *   the state    `useForm` (`src/hooks/common/useForm.ts`): a hook named
 *                `use...Form` anywhere in `src/` composes it, so no form hand-rolls
 *                its values, busy flag and error again
 *
 * No baseline: both counts reached zero in the round that added the guard.
 */

const ROOT = process.cwd();
const COMPONENT_SCOPE = ['src/components', 'src/app'];
const UI_KIT = 'src/components/ui/';
const FORM_HOOK = /^use\w+Form$/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [relative(ROOT, path).split(sep).join('/')];
  });
}

function parse(source: string, file: string): ts.SourceFile {
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

/** Native form controls belong to the UI kit, including mobile routes. */
export function rawControls(source: string, file: string): string[] {
  return rawElements(source, file, new Set(['input', 'textarea', 'select']));
}

/** Every raw `<form>` opening in a source, as `line: <form>`. */
export function rawForms(source: string, file: string): string[] {
  return rawElements(source, file, new Set(['form']));
}

function rawElements(source: string, file: string, tags: Set<string>): string[] {
  const sf = parse(source, file);
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && tags.has(n.tagName.getText(sf))) {
      out.push(`${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}: <${n.tagName.getText(sf)}>`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

function callsUseForm(body: ts.Node): boolean {
  let found = false;
  const visit = (n: ts.Node) => {
    if (found) return;
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'useForm') found = true;
    else ts.forEachChild(n, visit);
  };
  visit(body);
  return found;
}

/** The `use...Form` hooks a source defines that never call `useForm` (from the common hook). */
export function formHooksWithoutUseForm(source: string, file: string): string[] {
  const sf = parse(source, file);
  const importsCommon = sf.statements.some((st) => ts.isImportDeclaration(st)
    && (st.moduleSpecifier as ts.StringLiteral).text === '@/hooks/common/useForm'
    && !!st.importClause?.namedBindings
    && ts.isNamedImports(st.importClause.namedBindings)
    && st.importClause.namedBindings.elements.some((el) => el.name.text === 'useForm'));
  const out: string[] = [];
  const check = (name: string, body: ts.Node | undefined) => {
    if (FORM_HOOK.test(name) && !(importsCommon && body && callsUseForm(body))) out.push(name);
  };
  const visit = (n: ts.Node) => {
    if (ts.isFunctionDeclaration(n) && n.name) check(n.name.text, n.body);
    else if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer
      && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))) check(n.name.text, n.initializer.body);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

describe('forms: one form element, one form hook', () => {
  it('no component renders a raw <form> outside the ui kit (use Form)', () => {
    const offenders = COMPONENT_SCOPE.flatMap((dir) => files(join(ROOT, dir)))
      .filter((f) => /\.(tsx|jsx)$/.test(f) && !f.startsWith(UI_KIT))
      .flatMap((f) => rawForms(readFileSync(join(ROOT, f), 'utf8'), f).map((hit) => `${f}: ${hit}`));
    expect(offenders, 'render Form from @/components/ui/forms (docs/ui/conventions.md#forms)').toEqual([]);
  });

  it('all inputs, selects and textareas use the UI kit', () => {
    const offenders = COMPONENT_SCOPE.flatMap((dir) => files(join(ROOT, dir)))
      .filter((f) => /\.(tsx|jsx)$/.test(f) && !f.startsWith(UI_KIT))
      .flatMap((f) => rawControls(readFileSync(join(ROOT, f), 'utf8'), f).map((hit) => `${f}: ${hit}`));
    expect(offenders, 'use Input, TextArea and Select from @/components/ui/forms').toEqual([]);
  });

  it('every use...Form hook composes the common useForm', () => {
    const offenders = files(join(ROOT, 'src'))
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .flatMap((f) => formHooksWithoutUseForm(readFileSync(join(ROOT, f), 'utf8'), f).map((name) => `${f}: ${name}`));
    expect(offenders, 'build the form on useForm from @/hooks/common/useForm and a spec next to its service').toEqual([]);
  });

  it('reads the files it means to', () => {
    const scanned = COMPONENT_SCOPE.flatMap((dir) => files(join(ROOT, dir)));
    expect(scanned).toContain('src/app/[locale]/voice/VoiceRoomForm.tsx');
    expect(files(join(ROOT, 'src'))).toContain('src/hooks/chat/channel/useChannelSettingsForm.ts');
    expect(rawForms(readFileSync(join(ROOT, 'src/components/ui/forms/Form.tsx'), 'utf8'), 'Form.tsx')).toHaveLength(1);
  });
});

describe('forms: the rule', () => {
  it('flags a raw <form>, self-closing or not, and not Form', () => {
    expect(rawForms('const a = <form onSubmit={x}><input /></form>;', 'a.tsx')).toEqual(['1: <form>']);
    expect(rawForms('const a = <form />;', 'a.tsx')).toEqual(['1: <form>']);
    expect(rawForms('const a = <Form form={f}><input /></Form>;', 'a.tsx')).toEqual([]);
  });

  it('flags a use...Form hook that hand-rolls its state', () => {
    const own = "import { useState } from 'react';\nexport function useThingForm() { const [v, setV] = useState(''); return { v, setV }; }";
    expect(formHooksWithoutUseForm(own, 'a.ts')).toEqual(['useThingForm']);
    const arrow = "export const useOtherForm = () => ({ busy: false });";
    expect(formHooksWithoutUseForm(arrow, 'a.ts')).toEqual(['useOtherForm']);
  });

  it('flags a hook that calls some other useForm, and passes one on the common hook', () => {
    const other = "import { useForm } from 'react-hook-form';\nexport function useThingForm() { return useForm(); }";
    expect(formHooksWithoutUseForm(other, 'a.ts')).toEqual(['useThingForm']);
    const common = "import { useForm } from '@/hooks/common/useForm';\nexport function useThingForm() { return useForm(spec()); }";
    expect(formHooksWithoutUseForm(common, 'a.ts')).toEqual([]);
  });

  it('leaves other names alone (useForm itself, useFormat)', () => {
    expect(formHooksWithoutUseForm('export function useForm() {}\nexport function useFormat() {}', 'a.ts')).toEqual([]);
  });
});

it('detects native controls without counting comments or UI components', () => {
  expect(rawControls('const a = <><input /><textarea /><select /><Input />{/* <input /> */}</>;', 'a.tsx'))
    .toEqual(['1: <input>', '1: <textarea>', '1: <select>']);
});
