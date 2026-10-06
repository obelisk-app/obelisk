/**
 * Helpers for handing a NIP-46 `nostrconnect://` URI to a signer app on the
 * same device (Amber, Nsec.app, Keychat...), where scanning your own screen
 * is not an option.
 */

/** On Android, an intent URL that opens Amber directly; elsewhere the URI itself. */
export function signerAppHref(uri: string, userAgent: string): string {
  if (!/Android/i.test(userAgent)) return uri;
  return `intent://${uri.slice('nostrconnect://'.length)}#Intent;scheme=nostrconnect;package=com.greenart7c3.nostrsigner;end`;
}

/** Copy the URI, falling back to a hidden textarea where the clipboard API is refused. */
export async function copyConnectionUri(uri: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(uri);
    return true;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = uri;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    try { return document.execCommand('copy'); }
    catch { return false; }
    finally { textarea.remove(); }
  }
}

/** The SDK's "closed before connected" error, which a fresh QR usually cures. */
export function isTransientNip46Error(message: string): boolean {
  return /subscription closed before (?:the )?connection was established/i.test(message);
}
