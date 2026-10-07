/**
 * Whether a media URL points back at this page's own origin, which loading
 * tells nobody anything (so the remote-media gate lets it through).
 */

/**
 * A URL this origin serves itself (relative, or absolute on our own host).
 * Loading it tells nobody anything they do not already know.
 */
export function isSameOriginMediaUrl(url: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}
