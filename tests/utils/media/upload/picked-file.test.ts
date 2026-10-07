import { describe, expect, it, vi } from 'vitest';
import { takePickedFile, takePickedFiles } from '@/utils/media/upload/picked-file';

function fileInput(files: File[]) {
  const input = document.createElement('input');
  input.type = 'file';
  Object.defineProperty(input, 'files', { configurable: true, value: files });
  return input;
}

describe('takePickedFile', () => {
  it('returns the first file and clears the input afterwards', () => {
    const first = new File(['a'], 'a.png');
    const input = fileInput([first, new File(['b'], 'b.png')]);
    const cleared = vi.spyOn(input, 'value', 'set');
    expect(takePickedFile(input)).toBe(first);
    expect(cleared).toHaveBeenCalledWith('');
  });

  it('returns nothing for an empty pick', () => {
    expect(takePickedFile(fileInput([]))).toBeUndefined();
  });
});

describe('takePickedFiles', () => {
  it('returns every file and clears the input afterwards', () => {
    const files = [new File(['a'], 'a.png'), new File(['b'], 'b.png')];
    const input = fileInput(files);
    const cleared = vi.spyOn(input, 'value', 'set');
    expect(takePickedFiles(input)).toEqual(files);
    expect(cleared).toHaveBeenCalledWith('');
  });

  it('returns an empty list for an empty pick', () => {
    expect(takePickedFiles(fileInput([]))).toEqual([]);
  });
});
