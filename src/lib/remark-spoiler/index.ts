import type { Root, Text, PhrasingContent } from 'mdast';
import { visit } from 'unist-util-visit';

export interface SpoilerNode {
  type: 'spoiler';
  children: PhrasingContent[];
  data: { hName: 'spoiler' };
}

declare module 'mdast' {
  interface RootContentMap {
    spoiler: SpoilerNode;
  }
  interface PhrasingContentMap {
    spoiler: SpoilerNode;
  }
}

const SPOILER_REGEX = /\|\|(.+?)\|\|/g;

/**
 * Remark plugin that transforms ||text|| into spoiler nodes.
 */
export default function remarkSpoiler() {
  return (tree: Root) => {
    visit(tree, 'text', (node: Text, index, parent) => {
      if (!parent || index === undefined) return;

      const value = node.value;
      if (!value.includes('||')) return;

      SPOILER_REGEX.lastIndex = 0;
      const children: PhrasingContent[] = [];
      let lastIdx = 0;
      let match: RegExpExecArray | null;

      while ((match = SPOILER_REGEX.exec(value)) !== null) {
        if (match.index > lastIdx) {
          children.push({ type: 'text', value: value.slice(lastIdx, match.index) });
        }
        children.push({
          type: 'spoiler',
          children: [{ type: 'text', value: match[1] }],
          data: { hName: 'spoiler' },
        } as SpoilerNode);
        lastIdx = match.index + match[0].length;
      }

      if (children.length === 0) return;

      if (lastIdx < value.length) {
        children.push({ type: 'text', value: value.slice(lastIdx) });
      }

      parent.children.splice(index, 1, ...children);
    });
  };
}
