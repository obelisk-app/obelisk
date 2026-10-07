import { describe, expect, it } from 'vitest';
import { fieldNoteId } from '@/utils/style/field-note';

describe('fieldNoteId', () => {
  it('names the note only when there is one', () => {
    expect(fieldNoteId('nick', true)).toBe('nick-note');
    expect(fieldNoteId('nick', false)).toBeUndefined();
  });
});
