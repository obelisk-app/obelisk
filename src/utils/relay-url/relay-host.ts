/**
 * A relay's address as a short label: its host (`wss://relay.example/` reads
 * `relay.example`). Unlike `shortHost` (`url-host.ts`), an address that does
 * not parse is still tidied, scheme and trailing slashes dropped, because it
 * comes from someone's relay list or a shared link and is shown or put in a
 * URL as it is.
 */
export function relayHostLabel(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^wss?:\/\//, '').replace(/\/+$/, '');
  }
}
