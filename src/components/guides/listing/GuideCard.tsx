import Card from '@/components/ui/layout/Card';
import { Link } from '@/i18n/navigation';
import type { GuideFrontmatter } from '@/services/guides/guides';
import { guidePath } from '@/utils/guides/guide-urls';
import { HERO_REGISTRY } from '@/assets/illustrations/guides';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

interface Props {
  slug: string;
  frontmatter: GuideFrontmatter;
}

export default function GuideCard({ slug, frontmatter }: Props) {
  const Hero = HERO_REGISTRY[frontmatter.heroComponent];

  return (
    <Card variant="interactive" padding="none" asChild>
      <Link
        href={guidePath(slug)}
        className="group block overflow-hidden"
        data-testid={`guide-card-${slug}`}
      >
        <div className="aspect-[16/8] bg-lc-black border-b border-lc-border overflow-hidden">
          {Hero ? <Hero /> : <div className="w-full h-full bg-lc-olive-dark" />}
        </div>
        <div className="p-5">
          <Heading as="h2" variant="cardLink">
            {frontmatter.title}
          </Heading>
          <Text as="p" variant="muted" className="mt-2 line-clamp-2">{frontmatter.description}</Text>
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
    </Card>
  );
}
