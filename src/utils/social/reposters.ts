/** The row's own author first, then everyone else who reposted the same note, each once. */
export function uniqueReposters(author: string, reposters: readonly string[] | undefined): string[] {
  return [...new Set([author, ...(reposters ?? [])])];
}

/**
 * "Alice, Bob and 6 others": the two names shown and how many are left.
 * Two names then a count, because three is already too wide for a feed row
 * and the number is what tells you how much reach the note actually got.
 */
export function repostersLine(pubkeys: readonly string[]): { shown: string[]; rest: number } {
  const shown = pubkeys.slice(0, 2);
  return { shown, rest: pubkeys.length - shown.length };
}
