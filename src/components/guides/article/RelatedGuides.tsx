import { getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n';
import { readGuide } from '@/services/guides/guides';
import { relatedGuideCards, type RelatedGuideItem } from '@/utils/guides/related';
import RelatedGuideCard from './RelatedGuideCard';

interface Props {
  locale: Locale;
  items: RelatedGuideItem[];
}

/** The "keep reading" strip under an article: one card per related guide that exists; nothing when none does. */
export default async function RelatedGuides({ locale, items }: Props) {
  const guides = await Promise.all(items.map((item) => readGuide(locale, item.slug).catch(() => null)));
  const resolved = relatedGuideCards(items, guides);

  if (resolved.length === 0) return null;
  const t = await getTranslations({ locale });

  return (
    <section className="my-12 not-prose" aria-labelledby="related-guides-heading">
      <h2
        id="related-guides-heading"
        className="text-2xl font-bold text-lc-white tracking-tight mb-4"
      >
        {t('guides.related.heading')}
      </h2>
      <div
        className="flex gap-4 overflow-x-auto snap-x snap-mandatory -mx-6 px-6 pb-4 [scrollbar-width:thin]"
        role="list"
      >
        {resolved.map((guide) => (
          <RelatedGuideCard key={guide.slug} guide={guide} />
        ))}
      </div>
    </section>
  );
}
