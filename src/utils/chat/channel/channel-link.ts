import { shortHost } from '@/utils/relay-url/url-host';

/**
 * Links into a channel, in the two shapes the app writes:
 *
 * - `channelLink`: a fresh `https://<origin>/app?relay=<host>&c=<id>`, for a
 *   channel the user is not necessarily looking at (the channel menu).
 * - `channelInviteLink` / `messageLink`: the current page with its query
 *   replaced by `?c=<id>[&m=<message>]&relay=<host>`, for the channel or
 *   message on screen. These lived beside the panes that used them.
 */

/** `https://…/app?relay=<host>&c=<id>`, the deep-link shape the app parses. */
export function channelLink(relay: string, channelId: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://obelisk.ar';
  const host = relay.replace(/^wss?:\/\//, '');
  return `${origin}/app?relay=${encodeURIComponent(host)}&c=${encodeURIComponent(channelId)}`;
}

function pageLink(href: string, params: ReadonlyArray<[string, string]>, relay: string): string {
  const url = new URL(href);
  url.search = '';
  for (const [key, value] of params) url.searchParams.set(key, value);
  if (relay) url.searchParams.set('relay', shortHost(relay));
  return url.toString();
}

/** The shareable link to a channel: this page, `?c=<id>` and the relay host, nothing else. */
export function channelInviteLink(href: string, groupId: string, relay: string): string {
  return pageLink(href, [['c', groupId]], relay);
}

/** The shareable link to one message: this page, `?c=<channel>&m=<message>` and the relay host. */
export function messageLink(href: string, groupId: string, messageId: string, relay: string): string {
  return pageLink(href, [['c', groupId], ['m', messageId]], relay);
}
