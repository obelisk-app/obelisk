import type { MouseEvent } from 'react';
import { isModifiedClick, navigateInApp } from '@/utils/message-text/chat-link';

/**
 * A click on a link into the app shell: a plain click navigates in place
 * (pushState + popstate, no reload); a modified click (new tab, ...) is
 * left to the browser.
 */
export function followInAppLink(e: MouseEvent, path: string): void {
  if (isModifiedClick(e)) return;
  e.preventDefault();
  navigateInApp(path);
}

/**
 * A click on a channel pill. Without read access the click does nothing; a
 * modified click is left to the browser; a plain one pushes the link's own
 * path and query and lets the shells' popstate listeners route, keeping the
 * chat page mounted. An href that does not parse is ignored.
 */
export function followChannelPill(e: MouseEvent, href: string, noAccess: boolean): void {
  if (noAccess) {
    e.preventDefault();
    return;
  }
  if (isModifiedClick(e)) return;
  e.preventDefault();
  try {
    const url = new URL(href, window.location.href);
    window.history.pushState(null, '', url.pathname + url.search);
    window.dispatchEvent(new PopStateEvent('popstate'));
  } catch {
    /* no-op */
  }
}
