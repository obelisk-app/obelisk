export interface ChatLinkTarget {
  /** Path plus query, what `pushState` navigates to. */
  path: string;
  slug: string | null;
  messageId?: string;
  postId?: string;
}

/**
 * A same-origin `/chat?c=<slug>[&m=|&p=]` link, or null for anything else
 * (another origin, another path, an unparseable href, or no window).
 */
export function chatLinkTarget(href: string): ChatLinkTarget | null {
  try {
    const url = new URL(href, typeof window !== 'undefined' ? window.location.href : 'http://x');
    if (
      typeof window === 'undefined' ||
      url.origin !== window.location.origin ||
      url.pathname !== '/chat'
    ) {
      return null;
    }
    const sp = url.searchParams;
    return {
      path: url.pathname + url.search,
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
