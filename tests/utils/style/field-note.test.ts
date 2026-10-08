import { describe, expect, it } from 'vitest';
import { fieldDescriptionIds, fieldNoteId } from '@/utils/style/field-note';

describe('fieldNoteId', () => {
  it('names the note only when there is one', () => {
    expect(fieldNoteId('nick', true)).toBe('nick-note');
    expect(fieldNoteId('nick', false)).toBeUndefined();
  });
});

it('merges note and caller IDs once while ignoring empty whitespace', () => {
  expect(fieldDescriptionIds('control-note', ' external\tcontrol-note external  more ')).toBe('control-note external more');
  expect(fieldDescriptionIds(undefined, ' external ')).toBe('external');
  expect(fieldDescriptionIds(undefined, '  ')).toBeUndefined();
});
