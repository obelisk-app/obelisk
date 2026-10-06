import { shortHost } from '@/utils/relay-url/url-host';

/** The shareable link to one message: this page, `?c=<channel>&m=<message>` and the relay host. */
export function messageLink(href: string, groupId: string, messageId: string, relay: string): string {
  const url = new URL(href);
  url.search = '';
  url.searchParams.set('c', groupId);
  url.searchParams.set('m', messageId);
  if (relay) url.searchParams.set('relay', shortHost(relay));
  return url.toString();
}

/** Scroll a message into view and flash its ring, the way a reply jump lands. */
export function flashMessage(messageId: string, ms: number): void {
  const el = document.querySelector(`[data-msg-id="${messageId}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('ring-1', 'ring-lc-green');
  setTimeout(() => el.classList.remove('ring-1', 'ring-lc-green'), ms);
}
