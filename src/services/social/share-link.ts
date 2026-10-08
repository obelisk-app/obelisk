import { writeClipboardText } from '@/services/common/clipboard';

/**
 * Hand a link to the system share sheet, or copy it where there is none.
 *
 * Resolves `true` when the link went somewhere (shared, or copied) and
 * `false` when sharing is dismissed or the clipboard write fails. The
 * caller only confirms a share that happened.
 */
export async function shareOrCopyLink(data: { url: string; title?: string }): Promise<boolean> {
  try {
    if (navigator.share) await navigator.share(data);
    else await writeClipboardText(data.url);
    return true;
  } catch {
    return false;
  }
}
