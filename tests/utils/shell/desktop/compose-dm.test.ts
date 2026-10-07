import { describe, expect, it } from 'vitest';
import { clampActiveIndex, composeDmKeyAction } from '@/utils/shell/desktop/compose-dm';

describe('clampActiveIndex', () => {
  it('keeps the highlight on the list', () => {
    expect(clampActiveIndex(5, 3)).toBe(2);
    expect(clampActiveIndex(1, 3)).toBe(1);
    expect(clampActiveIndex(4, 0)).toBe(0);
  });
});

describe('composeDmKeyAction', () => {
  it('closes on Escape, list or not', () => {
    expect(composeDmKeyAction('Escape', 0, 0)).toEqual({ kind: 'close' });
  });

  it('moves the highlight round the list', () => {
    expect(composeDmKeyAction('ArrowDown', 2, 3)).toEqual({ kind: 'highlight', index: 0 });
    expect(composeDmKeyAction('ArrowUp', 0, 3)).toEqual({ kind: 'highlight', index: 2 });
  });

  it('picks the highlighted row on Enter', () => {
    expect(composeDmKeyAction('Enter', 1, 3)).toEqual({ kind: 'pick', index: 1 });
  });

  it('lets every key type when there is nothing to move through or pick', () => {
    expect(composeDmKeyAction('ArrowDown', 0, 0)).toBeNull();
    expect(composeDmKeyAction('Enter', 0, 0)).toBeNull();
    expect(composeDmKeyAction('a', 0, 3)).toBeNull();
  });
});
