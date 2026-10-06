import { describe, expect, it } from 'vitest';
import { categoryLabel } from '@/utils/chat/category-label';
import { translator } from '@tests/support/intl';

describe('categoryLabel', () => {
  it('keeps a named category as it is', () => {
    expect(categoryLabel('Dev', translator('es'))).toBe('Dev');
  });

  it('names an empty or blank category in the reader\'s language', () => {
    expect(categoryLabel('', translator('en'))).toBe('Untitled');
    expect(categoryLabel('  ', translator('es'))).toBe('Sin título');
    expect(categoryLabel('', translator('pt'))).toBe('Sem título');
  });
});
