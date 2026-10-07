/** The name a voice tile shows: display name, else name, else the first 8 characters of the key. */
export function participantName(
  meta: { displayName?: string | null; name?: string | null } | null | undefined,
  pubkey: string,
): string {
  return meta?.displayName || meta?.name || pubkey.slice(0, 8);
}
