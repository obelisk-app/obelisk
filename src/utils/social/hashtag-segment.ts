/**
 * The hashtag a `/t/<tag>` URL names, as it travels on the wire: decoded,
 * without `#`, lowercase, and made of the same characters the composer
 * puts in a `t` tag. Null when the segment is not a tag.
 */
export function hashtagFromSegment(raw: string): string | null {
  let value: string;
  try {
    value = decodeURIComponent(raw);
  } catch {
    value = raw;
  }
  const clean = value.trim().replace(/^#/, '').toLowerCase();
  return /^[\p{L}\p{N}_-]{1,80}$/u.test(clean) ? clean : null;
}
