/**
 * A tag chip in the new-thread picker: `active` when picked, `disabled` when
 * it is not picked and the thread already carries the most tags it may.
 */
export function threadTagState(
  selectedTagIds: ReadonlyArray<string>,
  tagId: string,
  max: number,
): { active: boolean; disabled: boolean } {
  const active = selectedTagIds.includes(tagId);
  return { active, disabled: !active && selectedTagIds.length >= max };
}
