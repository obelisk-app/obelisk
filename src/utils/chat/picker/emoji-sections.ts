import { EMOJI_CATEGORIES } from '@/lib/emoji';

/** Every emoji of one picker section, its categories in order. */
export function sectionEmojis(section: { categories: readonly string[] }) {
  return section.categories.flatMap((category) => EMOJI_CATEGORIES[category] ?? []);
}
