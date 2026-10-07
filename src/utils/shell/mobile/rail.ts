import { shortHost } from '@/utils/relay-url/url-host';
import { normalizeRelayUrl, relayWebsiteUrl } from '@/utils/relay-url/normalize';

/**
 * Labels for the phone's relay rail and the server banner above the
 * channel list (`src/app/[locale]/app/mobile/rail/`).
 */

/**
 * A relay tile's name: the operator's kind 30078 branding name, else the
 * relay's NIP-11 name, else its host.
 */
export function relayTileLabel(brandingName: string | null | undefined, nip11Name: string | null | undefined, url: string): string {
  return brandingName || nip11Name || shortHost(url);
}

/** The letter a tile without an icon shows. */
export function relayTileLetter(label: string): string {
  return label.slice(0, 1).toUpperCase();
}

/** The unread badge's text: the count, or `99+` past 99. */
export function unreadBadgeText(count: number): string {
  return count > 99 ? '99+' : String(count);
}

/**
 * Whether a rail entry is the active relay, compared in canonical form, so
 * the host's case folds and the path's does not.
 */
export function isActiveRelay(url: string, activeRelay: string | null): boolean {
  return normalizeRelayUrl(url) === normalizeRelayUrl(activeRelay ?? '');
}

export interface ServerBannerParts {
  /** The relay's host, or `''` with no relay. */
  readonly host: string;
  /** The letter the icon shows without an image; `O` with no relay. */
  readonly iconFallback: string;
  /** The relay's own web page, when its URL has one. */
  readonly website: string | null;
}

/** What the server banner shows about `relayUrl`. */
export function serverBannerParts(relayUrl: string | null): ServerBannerParts {
  if (!relayUrl) return { host: '', iconFallback: 'O', website: null };
  const host = shortHost(relayUrl);
  return { host, iconFallback: host.slice(0, 1).toUpperCase(), website: relayWebsiteUrl(relayUrl) };
}
