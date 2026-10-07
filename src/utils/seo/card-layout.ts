import type { Guide } from '@/services/guides/guides';
import { guideSeoText } from './guide';

/**
 * Type sizes for the 1200x630 preview cards, picked from the text's length
 * so a long title wraps inside the card instead of running off it. The page
 * cards are `src/components/seo/OgCard.tsx`, the guide cards
 * `src/components/guides/article/GuideOgCard.tsx`.
 */

/** A page card's title size: smaller as the title grows. */
export function cardTitleSize(title: string): number {
  if (title.length <= 32) return 66;
  if (title.length <= 52) return 56;
  if (title.length <= 80) return 48;
  return 40;
}

export interface GuideCardText {
  titleFontSize: number;
  descFontSize: number;
  /** The description, cut with an ellipsis when it would not fit under that title. */
  description: string;
}

/**
 * A guide card's title and description sizes, and the description cut to
 * fit: a long title (swap-anything's) leaves less room, so both shrink and
 * the description may run longer at the smaller size.
 */
export function guideCardText(title: string, description: string): GuideCardText {
  const titleLen = title.length;
  const titleFontSize = titleLen > 56 ? 52 : titleLen > 40 ? 60 : 72;
  const descFontSize = titleLen > 56 ? 24 : 28;
  const descMax = descFontSize > 24 ? 200 : 220;
  const trimmed = description.length > descMax ? description.slice(0, descMax - 1) + '…' : description;
  return { titleFontSize, descFontSize, description: trimmed };
}

/** What a guide's card says: its title, its search description and its tags, or the site's name when the guide is missing. */
export function guideCardContent(guide: Guide | null): { title: string; description: string; tags: string[] } {
  if (!guide) return { title: 'Obelisk', description: '', tags: [] };
  return {
    title: guide.frontmatter.title,
    // The search description: written to fit, so the card never cuts it.
    description: guideSeoText(guide.frontmatter).description,
    tags: guide.frontmatter.tags || [],
  };
}
