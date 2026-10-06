/**
 * Writing to the clipboard, the one place that does it outside the
 * `useCopyToClipboard` hook (which adds a "copied" flag for a button).
 *
 * Four copies of "write, swallow the rejection, push a toast" used to live in
 * component folders (the DM menus, the profile popover, the note menu's raw
 * event copy) beside a fifth that fell back to a hidden textarea for the
 * NIP-46 signer link. They are one helper each now.
 */
import { useToastStore } from '@/store/toast';

/**
 * Copy `text`, falling back to a hidden textarea and `execCommand('copy')`
 * where the clipboard API is missing or refused (an insecure origin, an
 * embedded webview). True when either path reports success.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    // `Promise.resolve`: a clipboard shim may return undefined instead of a promise.
    await Promise.resolve(navigator.clipboard.writeText(text));
    return true;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    try { return document.execCommand('copy'); }
    catch { return false; }
    finally { textarea.remove(); }
  }
}

/**
 * Copy `text` (best effort, never throws out of a click handler) and confirm
 * with a toast. The toast is pushed straight away rather than after the
 * write settles, which is what every menu that uses it expects.
 */
export function copyWithToast(text: string, title: string, body = ''): void {
  void Promise.resolve(navigator.clipboard?.writeText(text)).catch(() => {});
  useToastStore.getState().pushToast({ title, body });
}
