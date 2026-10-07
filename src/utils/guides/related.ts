import type { Guide } from '@/services/guides/guides';

/** A related guide as the article lists it: an editor's `note` replaces the guide's own description. */
export interface RelatedGuideItem {
  slug: string;
  note?: string;
}

export interface RelatedGuideCard {
  slug: string;
  title: string;
  subtitle: string;
  hero: string;
}

/**
 * The cards for an article's related guides, in the order given. `guides`
 * holds what was read for each item (null when it does not exist in any
 * language); those are left out rather than shown as broken cards.
 */
export function relatedGuideCards(items: readonly RelatedGuideItem[], guides: ReadonlyArray<Guide | null>): RelatedGuideCard[] {
  return items.flatMap((item, i) => {
    const guide = guides[i];
    if (!guide) return [];
    return [{
      slug: item.slug,
      title: guide.frontmatter.title,
      subtitle: item.note ?? guide.frontmatter.description,
      hero: guide.frontmatter.heroComponent,
    }];
  });
}
