import { shortHost } from '@/utils/relay-url/url-host';

/** The shareable link to a channel: this page, `?c=<id>` and the relay host, nothing else. */
export function channelInviteLink(href: string, groupId: string, relay: string): string {
  const url = new URL(href);
  url.search = '';
  url.searchParams.set('c', groupId);
  if (relay) url.searchParams.set('relay', shortHost(relay));
  return url.toString();
}
