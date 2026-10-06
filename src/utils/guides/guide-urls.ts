/**
 * Guide URLs are the same in every language: `/guides` and
 * `/guides/<slug>`, which the locale-aware `Link` and `localizedPath`
 * prefix with `/es` or `/pt`. Slugs are shared across languages
 * (`content/guides/{en,es,pt}` hold the same file names), so the hreflang
 * pairs are `/guides/x`, `/es/guides/x`, `/pt/guides/x`.
 */
export function guidePath(slug?: string): string {
  return slug ? `/guides/${slug}` : '/guides';
}
