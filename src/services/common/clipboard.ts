/** Clipboard writes and the feedback/fallback policies used by their callers. */
import { useToastStore } from '@/store/feedback/toast';

/** Write through the clipboard API; reject when unavailable or refused. */
export async function writeClipboardText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

/**
 * Copy `text`, falling back to a hidden textarea and `execCommand('copy')`
 * where the clipboard API is missing or refused (an insecure origin, an
 * embedded webview). True when either path reports success.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await writeClipboardText(text);
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
  void writeClipboardText(text).catch(() => {});
  useToastStore.getState().pushToast({ title, body });
}
