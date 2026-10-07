/** A typed colour the preferences can take: a whole `#rrggbb`, lowercased; null while it is still being typed. */
export function completeHexColor(text: string): string | null {
  return /^#[0-9a-f]{6}$/i.test(text) ? text.toLowerCase() : null;
}
