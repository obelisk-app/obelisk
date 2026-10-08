import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { buildImportGraph } from '@tests/support/import-graph';

describe('toast ownership', () => {
  it('mounts one shared host for all locale routes', () => {
    const hosts: string[] = [];
    for (const file of buildImportGraph().files.filter((file) => file.startsWith('src/app/') || file.startsWith('src/components/'))) {
      const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (node: ts.Node) => {
        if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && ts.isIdentifier(node.tagName) && node.tagName.text === 'ToastStack') hosts.push(file);
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(hosts).toEqual(['src/app/[locale]/layout.tsx']);
  });
});
