import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = join(dir, entry.name);
    return entry.isDirectory() ? files(file) : file.endsWith('.tsx') ? [file] : [];
  });
}

/** Standard Button recipes own resting padding, shape, color and type size. */
function overrides(source: string): string[] {
  const sf = ts.createSourceFile('component.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = new Set<string>();
  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (statement.moduleSpecifier.text === '@/components/ui/buttons/Button' && statement.importClause?.name) names.add(statement.importClause.name.text);
    if (statement.moduleSpecifier.text === '@/components/ui/buttons' && statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)) {
      for (const binding of statement.importClause.namedBindings.elements) {
        if ((binding.propertyName ?? binding.name).text === 'Button') names.add(binding.name.text);
      }
    }
  }
  const hits: string[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && names.has(node.tagName.getText(sf))) {
      const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
      const variant = attributes.find((attr) => attr.name.getText(sf) === 'variant')?.initializer;
      if (variant && ts.isStringLiteral(variant) && variant.text === 'bare') return;
      const classes = attributes.find((attr) => attr.name.getText(sf) === 'className')?.initializer;
      const inspect = (value: ts.Node) => {
        if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value) || ts.isTemplateHead(value) || ts.isTemplateMiddle(value) || ts.isTemplateTail(value)) {
          for (const token of value.text.split(/\s+/)) {
            // State styling and surrounding layout remain caller responsibilities.
            if (/^!?(?:p[xytrblse]?-.+|rounded(?:-.+)?|bg-.+|border-(?:lc-|red-|green-|white|black).+|text-(?:lc-.+|red-.+|green-.+|white(?:\/.*)?|black(?:\/.*)?|xs|sm|base|lg|[2-9]?xl|\[.+\]))$/.test(token)) hits.push(token);
          }
        }
        ts.forEachChild(value, inspect);
      };
      if (classes) inspect(classes);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

it('keeps standard Button appearance in its variants across routes and features', () => {
  const offenders = ['src/app', 'src/components'].flatMap(files)
    .filter((file) => !file.startsWith('src/components/ui/'))
    .flatMap((file) => overrides(readFileSync(file, 'utf8')).map((token) => `${file}: ${token}`));
  expect(offenders).toEqual([]);
});

it('checks imported aliases and conditional recipes without rejecting layout or compound controls', () => {
  const imported = `import Action from '@/components/ui/buttons/Button';`;
  expect(overrides(`${imported}<Action variant="ghost" className="rounded-full px-2.5 text-red-400" />`)).toEqual(['rounded-full', 'px-2.5', 'text-red-400']);
  expect(overrides(`${imported}<Action className={active ? '!bg-green-500' : 'text-lc-muted'} />`)).toEqual(['!bg-green-500', 'text-lc-muted']);
  expect(overrides(`${imported}<><Action className="w-full mt-2 shrink-0 aria-pressed:text-lc-green" /><Action variant="bare" className="rounded-full px-2" /></>`)).toEqual([]);
  expect(overrides(`<OtherButton className="rounded-full" />`)).toEqual([]);
});
