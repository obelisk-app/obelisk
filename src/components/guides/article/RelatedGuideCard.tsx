import { Link } from '@/i18n/navigation';
import { guidePath } from '@/utils/guides/guide-urls';
import type { RelatedGuideCard as Card } from '@/utils/guides/related';
import { HERO_REGISTRY } from '../svg';

/** One related guide: its hero (or a plain panel when it has none), title and line under it. */
export default function RelatedGuideCard({ guide }: { guide: Card }) {
  const Hero = HERO_REGISTRY[guide.hero];
  return (
    <Link
      href={guidePath(guide.slug)}
      role="listitem"
      data-testid={`related-guide-${guide.slug}`}
      className="group shrink-0 w-[260px] sm:w-[300px] snap-start rounded-xl overflow-hidden border border-lc-border bg-lc-dark hover:border-lc-green transition-colors"
    >
      <div className="aspect-[16/9] bg-lc-black border-b border-lc-border overflow-hidden">
        {Hero ? <Hero /> : <div className="w-full h-full bg-lc-olive-dark" />}
      </div>
      <div className="p-4">
        <h3 className="text-base font-bold text-lc-white group-hover:text-lc-green transition-colors">
          {guide.title}
        </h3>
        <p className="mt-1.5 text-sm text-lc-muted line-clamp-2 leading-snug">
          {guide.subtitle}
        </p>
      </div>
    </Link>
  );
}
