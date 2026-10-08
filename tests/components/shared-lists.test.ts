import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { buildImportGraph } from '@tests/support/import-graph';

describe('shared component lists', () => {
  it('uses List for list markup, including prose and menu adapters', () => {
    const lists: string[] = [];
    for (const file of buildImportGraph().files.filter((file) => file.startsWith('src/components/'))) {
      const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (node: ts.Node) => {
        if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && ts.isIdentifier(node.tagName) && ['ul', 'ol'].includes(node.tagName.text)) {
          lists.push(file);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(lists).toEqual([]);
  });
});
