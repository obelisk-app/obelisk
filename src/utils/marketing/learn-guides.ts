/**
 * The Learn carousel's order: the guides named in `lead` first, in that order,
 * then every other guide as it came (the sort is stable).
 */
export function orderLearnGuides<T extends { slug: string }>(guides: readonly T[], lead: readonly string[]): T[] {
  const rank = (slug: string) => (lead.includes(slug) ? lead.indexOf(slug) : lead.length);
  return [...guides].sort((a, b) => rank(a.slug) - rank(b.slug));
}
