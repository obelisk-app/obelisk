import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { buildImportGraph } from '@tests/support/import-graph';

describe('shared component links', () => {
  it('keeps native anchors in the Link primitive, including content and menu adapters', () => {
    const anchors: string[] = [];
    for (const file of buildImportGraph().files.filter((file) => file.startsWith('src/components/'))) {
      const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (node: ts.Node) => {
        if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && ts.isIdentifier(node.tagName) && node.tagName.text === 'a') {
          anchors.push(file);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(anchors).toEqual(['src/components/ui/navigation/Link.tsx']);
  });
});
