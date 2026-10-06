export interface ChatLinkTarget {
  /** Path plus query, what `pushState` navigates to. */
  path: string;
  slug: string | null;
  messageId?: string;
  postId?: string;
}

import { appShellPath } from '@/utils/shell/mobile/url-state';

/** `/chat` (the legacy name) or `/app`, in any language (`/es/app`). */
const CHAT_PATH = /^(?:\/(?:es|pt))?\/(?:chat|app)$/;

/**
 * A same-origin `/chat?c=<slug>[&m=|&p=]` link (or the same under `/app`,
 * `/es/app`, `/pt/app`), or null for anything else (another origin, another
 * path, an unparseable href, or no window). The path it returns is the chat
 * shell in the reader's current language, so following a link written by an
 * English speaker does not switch a Spanish reader to English.
 */
export function chatLinkTarget(href: string): ChatLinkTarget | null {
  try {
    const url = new URL(href, typeof window !== 'undefined' ? window.location.href : 'http://x');
    if (
      typeof window === 'undefined' ||
      url.origin !== window.location.origin ||
      !CHAT_PATH.test(url.pathname)
    ) {
      return null;
    }
    const sp = url.searchParams;
    return {
      path: appShellPath(window.location.pathname) + url.search,
      slug: sp.get('c'),
      messageId: sp.get('m') || undefined,
      postId: sp.get('p') || undefined,
    };
  } catch {
    return null;
  }
}

/** In-app navigation without a reload: push the path and let the shells' popstate listeners route. */
export function navigateInApp(path: string): void {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
