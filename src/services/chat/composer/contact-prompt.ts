/** Ask for an npub or hex key with `question`; the trimmed answer, or null when cancelled or blank. */
export function promptForContact(question: string): string | null {
  const value = window.prompt(question);
  return value?.trim() ? value.trim() : null;
}
