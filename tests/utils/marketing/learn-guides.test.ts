import { describe, expect, it } from 'vitest';
import { orderLearnGuides } from '@/utils/marketing/learn-guides';

const g = (slug: string) => ({ slug });

describe('orderLearnGuides', () => {
  it('puts the lead guides first, in the lead order', () => {
    expect(orderLearnGuides([g('c'), g('b'), g('a')], ['a', 'b']).map((x) => x.slug)).toEqual(['a', 'b', 'c']);
  });

  it('keeps the rest in the order they came', () => {
    expect(orderLearnGuides([g('z'), g('lead'), g('y'), g('x')], ['lead']).map((x) => x.slug)).toEqual(['lead', 'z', 'y', 'x']);
  });

  it('ignores lead slugs that are not there and leaves the input alone', () => {
    const input = [g('b'), g('a')];
    expect(orderLearnGuides(input, ['missing', 'a']).map((x) => x.slug)).toEqual(['a', 'b']);
    expect(input.map((x) => x.slug)).toEqual(['b', 'a']);
  });
});
