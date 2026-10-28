import PageSection from '@/components/ui/layout/PageSection';
import Container from '@/components/ui/layout/Container';
import { useTranslations } from 'next-intl';
import Link from '@/components/ui/navigation/Link';
import { guidePath } from '@/utils/guides/guide-urls';
import type { GuideFrontmatter } from '@/services/guides/guides';
import { LEARN_GUIDES } from '@/constants/marketing/landing';
import { orderLearnGuides } from '@/utils/marketing/learn-guides';
import GuideCard from '@/components/guides/listing/GuideCard';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';
import GuideCarouselControls from './GuideCarouselControls';

const TRACK_ID = 'learn-track';

/**
 * Every guide as a swipeable carousel of the guide cards (hero art, title,
 * summary, tags), the intro guides first, then the link to the guides index.
 */
export default function LearnSection({ guides: all }: { guides: readonly { slug: string; frontmatter: GuideFrontmatter }[] }) {
  const t = useTranslations();
  const guides = orderLearnGuides(all, LEARN_GUIDES);

  return (
    <PageSection reveal id="learn">
      <Container width="6xl">
        <div className="mb-10 flex flex-col items-center gap-6 text-center md:flex-row md:items-end md:justify-between md:text-left">
          <div>
            <Heading as="h2" variant="section" className="mb-4">
              {t('marketing.learn.heading')}
            </Heading>
            <Text as="p" variant="lead" className="max-w-xl">
              {t('marketing.learn.subtitle')}
            </Text>
          </div>
          <div className="hidden md:block">
            <GuideCarouselControls trackId={TRACK_ID} prevLabel={t('marketing.learn.prev')} nextLabel={t('marketing.learn.next')} />
          </div>
        </div>
        <div
          id={TRACK_ID}
          className="-mx-6 flex snap-x snap-mandatory scroll-px-6 gap-5 overflow-x-auto px-6 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {guides.map((g) => (
            <GuideCard
              key={g.slug}
              slug={g.slug}
              frontmatter={g.frontmatter}
              headingAs="h3"
              className="w-[85%] shrink-0 snap-start sm:w-[calc(50%-10px)] lg:w-[calc((100%-40px)/3)]"
            />
          ))}
        </div>
        <div className="mt-8 flex items-center justify-center gap-4 md:justify-start">
          <div className="md:hidden">
            <GuideCarouselControls trackId={TRACK_ID} prevLabel={t('marketing.learn.prev')} nextLabel={t('marketing.learn.next')} />
          </div>
          <Link
            href={guidePath()}
            variant="button" buttonVariant="pillSecondary" size="sm" className="inline-flex items-center gap-2"
          >
            {t('marketing.learn.cta')} <span aria-hidden="true">→</span>
          </Link>
        </div>
      </Container>
    </PageSection>
  );
}
