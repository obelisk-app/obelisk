/**
 * Pasting a screenshot is how most images actually reach a composer, and the
 * file picker used to be the only way in. Drag-and-drop shares this path.
 */
export function filesFromDataTransfer(data: DataTransfer | null): File[] {
  if (!data) return [];
  const files: File[] = [];
  // `items` carries pasted screenshots (which have no entry in `files` on
  // some browsers); `files` carries dragged ones. Union, then de-dupe.
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (file && file.type.startsWith('image/')) files.push(file);
  }
  for (const file of Array.from(data.files ?? [])) {
    if (file.type.startsWith('image/') && !files.some((f) => f.name === file.name && f.size === file.size)) {
      files.push(file);
    }
  }
  return files;
}
