import Link from 'next/link';
import type { Locale } from '@/i18n';
import type { GuideFrontmatter } from '@/lib/guides';
import { guidesHref } from '@/lib/guide-urls';
import { HERO_REGISTRY } from './svg';

interface Props {
  slug: string;
  locale: Locale;
  frontmatter: GuideFrontmatter;
}

export default function GuideCard({ slug, locale, frontmatter }: Props) {
  const Hero = HERO_REGISTRY[frontmatter.heroComponent];

  return (
    <Link
      href={guidesHref(locale, slug)}
      className="lc-card group block overflow-hidden"
      data-testid={`guide-card-${slug}`}
    >
      <div className="aspect-[16/8] bg-lc-black border-b border-lc-border overflow-hidden">
        {Hero ? <Hero /> : <div className="w-full h-full bg-lc-olive-dark" />}
      </div>
      <div className="p-5">
        <h3 className="text-lg font-bold text-lc-white group-hover:text-lc-green transition-colors">
          {frontmatter.title}
        </h3>
        <p className="mt-2 text-sm text-lc-muted line-clamp-2">{frontmatter.description}</p>
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          {frontmatter.tags?.slice(0, 3).map((t) => (
            <span
              key={t}
              className="text-[11px] px-2 py-0.5 rounded-full bg-lc-olive-dark text-lc-green font-mono"
            >
              #{t}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
