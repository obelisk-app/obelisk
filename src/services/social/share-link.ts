/**
 * Hand a link to the system share sheet, or copy it where there is none.
 *
 * Resolves `true` when the link went somewhere (shared, or copied) and
 * `false` when the reader dismissed the share sheet, which is not an error
 * worth surfacing: the caller only confirms a share that happened.
 */
export async function shareOrCopyLink(data: { url: string; title?: string }): Promise<boolean> {
  try {
    if (navigator.share) await navigator.share(data);
    else await navigator.clipboard?.writeText(data.url);
    return true;
  } catch {
    return false;
  }
}
