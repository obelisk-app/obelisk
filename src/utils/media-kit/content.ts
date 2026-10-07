/**
 * The media kit's data: brand colours, links, downloadable assets and the
 * embed snippets. Kept out of the components so the page reads as layout.
 *
 * Every word on the page, the brand copy included, comes from `mediaKit.*`
 * in the visitor's language: the pitches, taglines and one-liners are
 * `mediaKit.brand.*`, and the embed snippets are built from them here. What
 * stays literal is the name itself, the links and the markup around the copy.
 */

import type { MessageKey } from '@/i18n/keys';
import { EMBED_BADGE_MARK_SVG } from '@/assets/brand/embed-badge-mark';
import { BRAND_NAME } from '@/constants/media-kit/content';

export type Color = { nameKey: MessageKey; token: string; hex: string; usageKey: MessageKey };

// `/obelisk.png` used to lead this list. It is the pre-hollow-face artwork
// (both faces solid, ~8% wider at the base) and no longer matches the icon we
// ship, so it is not offered for download. The file stays in /public so old
// external links keep resolving.
export type Asset = { src: string; labelKey: MessageKey; bg: string; download: string };

/** Escapes text for HTML element content and double-quoted attributes. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The banner pill snippet, lettered with the page language's tagline. */
export function embedHtmlBanner(tagline: string): string {
  return `<a href="https://obelisk.ar" target="_blank" rel="noopener" style="display:inline-block;text-decoration:none;font-family:Inter,system-ui,sans-serif;background:#0a0a0a;border:1px solid #262626;border-radius:12px;padding:14px 20px;color:#fafafa;">
  <span style="display:flex;align-items:center;gap:12px;">
    <span style="display:inline-block;width:10px;height:10px;border-radius:9999px;background:#b4f953;box-shadow:0 0 12px #b4f953;"></span>
    <span style="font-weight:700;letter-spacing:-0.01em;">${BRAND_NAME}</span>
    <span style="color:#a3a3a3;">- ${escapeHtml(tagline)}</span>
  </span>
</a>`;
}

/** The "powered by" badge snippet; `label` is its text in the page language. */
export function embedBadge(label: string): string {
  return `<a href="https://obelisk.ar" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:#b4f953;color:#0a0a0a;font-family:Inter,system-ui,sans-serif;font-weight:700;font-size:13px;border-radius:9999px;text-decoration:none;">
  ${EMBED_BADGE_MARK_SVG}
  ${escapeHtml(label)}
</a>`;
}

/** The Open Graph meta tags, with the tagline and one-liner in the page language. */
export function embedOg({ comment, tagline, oneLiner }: { comment: string; tagline: string; oneLiner: string }): string {
  return `<!-- ${escapeHtml(comment)} -->
<meta property="og:title" content="${BRAND_NAME} - ${escapeHtml(tagline)}" />
<meta property="og:description" content="${escapeHtml(oneLiner)}" />
<meta property="og:image" content="https://obelisk.ar/og/obelisk.png" />
<meta property="og:url" content="https://obelisk.ar" />
<meta name="twitter:card" content="summary_large_image" />`;
}

/**
 * Quick-use phrases, each with its copy button. A phrase is either literal
 * (`value`: the name, the links) or copy in the page language (`valueKey`).
 */
export type ShortCopyItem = { labelKey: MessageKey } & ({ value: string } | { valueKey: MessageKey });

