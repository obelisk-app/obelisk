import { describe, it, expect } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkSpoiler from './remark-spoiler';

function parse(md: string) {
  const processor = unified().use(remarkParse).use(remarkSpoiler);
  return processor.runSync(processor.parse(md));
}

describe('remarkSpoiler', () => {
  it('transforms ||text|| into spoiler nodes', () => {
    const tree = parse('this is ||hidden|| text');
    const paragraph = tree.children[0] as { children: { type: string; value?: string }[] };
    expect(paragraph.children).toHaveLength(3);
    expect(paragraph.children[0]).toEqual({ type: 'text', value: 'this is ' });
    expect(paragraph.children[1].type).toBe('spoiler');
    expect(paragraph.children[2]).toEqual({ type: 'text', value: ' text' });
  });

  it('handles multiple spoilers', () => {
    const tree = parse('||a|| and ||b||');
    const paragraph = tree.children[0] as { children: { type: string }[] };
    const spoilers = paragraph.children.filter(c => c.type === 'spoiler');
    expect(spoilers).toHaveLength(2);
  });

  it('leaves text without spoilers unchanged', () => {
    const tree = parse('no spoilers here');
    const paragraph = tree.children[0] as { children: { type: string; value?: string }[] };
    expect(paragraph.children).toHaveLength(1);
    expect(paragraph.children[0].type).toBe('text');
  });

  it('handles single pipe without matching', () => {
    const tree = parse('a | b | c');
    const paragraph = tree.children[0] as { children: { type: string }[] };
    const spoilers = paragraph.children.filter(c => c.type === 'spoiler');
    expect(spoilers).toHaveLength(0);
  });
});
