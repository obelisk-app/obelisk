/**
 * The first file a file input just handed over, read before the input is
 * cleared, so that picking the same file again fires `change` again.
 */
export function takePickedFile(input: HTMLInputElement): File | undefined {
  const file = input.files?.[0];
  input.value = '';
  return file;
}
