/** `aria-describedby` for a control wrapped by a Field that shows a note (the Field gives the note the id `<control id>-note`). */
export function fieldNoteId(id: string, hasNote: boolean): string | undefined {
  return hasNote ? `${id}-note` : undefined;
}

/** Keep a field's own note alongside caller-provided description IDs, without repeats. */
export function fieldDescriptionIds(noteId: string | undefined, describedBy: string | undefined): string | undefined {
  const ids = [noteId, ...(describedBy?.split(/\s+/) ?? [])].filter(Boolean);
  return [...new Set(ids)].join(' ') || undefined;
}
