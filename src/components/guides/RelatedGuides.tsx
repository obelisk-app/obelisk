import Link from 'next/link';
import type { Locale } from '@/i18n';
import { readGuide } from '@/lib/guides';
import { guidesHref } from '@/lib/guide-urls';
import { HERO_REGISTRY } from './svg';

interface Item {
  slug: string;
  note?: string;
}

interface Props {
  locale: Locale;
  items: Item[];
}

const HEADING: Record<Locale, string> = {
  en: 'See also',
  es: 'Ver también',
};

async function resolveItem(locale: Locale, slug: string, note?: string) {
  try {
    const guide = await readGuide(locale, slug);
    return {
      slug,
      title: guide.frontmatter.title,
      subtitle: note ?? guide.frontmatter.description,
      hero: guide.frontmatter.heroComponent,
    };
  } catch {
    return null;
  }
}

export default async function RelatedGuides({ locale, items }: Props) {
  const resolved = (
    await Promise.all(items.map((i) => resolveItem(locale, i.slug, i.note)))
  ).filter(<T,>(x: T | null): x is T => x !== null);

  if (resolved.length === 0) return null;

  return (
    <section className="my-12 not-prose" aria-labelledby="related-guides-heading">
      <h2
        id="related-guides-heading"
        className="text-2xl font-bold text-lc-white tracking-tight mb-4"
      >
        {HEADING[locale]}
      </h2>
      <div
        className="flex gap-4 overflow-x-auto snap-x snap-mandatory -mx-6 px-6 pb-4 [scrollbar-width:thin]"
        role="list"
      >
        {resolved.map((r) => {
          const Hero = HERO_REGISTRY[r.hero];
          return (
            <Link
              key={r.slug}
              href={guidesHref(locale, r.slug)}
              role="listitem"
              data-testid={`related-guide-${r.slug}`}
              className="group shrink-0 w-[260px] sm:w-[300px] snap-start rounded-xl overflow-hidden border border-lc-border bg-lc-dark hover:border-lc-green transition-colors"
            >
              <div className="aspect-[16/9] bg-lc-black border-b border-lc-border overflow-hidden">
                {Hero ? <Hero /> : <div className="w-full h-full bg-lc-olive-dark" />}
              </div>
              <div className="p-4">
                <h3 className="text-base font-bold text-lc-white group-hover:text-lc-green transition-colors">
                  {r.title}
                </h3>
                <p className="mt-1.5 text-sm text-lc-muted line-clamp-2 leading-snug">
                  {r.subtitle}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
