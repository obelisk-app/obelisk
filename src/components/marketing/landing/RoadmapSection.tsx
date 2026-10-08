import PageSection from '@/components/ui/layout/PageSection';
import Container from '@/components/ui/layout/Container';
import { useTranslations } from 'next-intl';
import { ROADMAP_PHASES } from '@/constants/marketing/landing';
import RoadmapPhase from './RoadmapPhase';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

/**
 * The roadmap as a vertical timeline.
 */
export default function RoadmapSection() {
  const t = useTranslations();
  return (
    <PageSection reveal id="roadmap">
      <Container width="4xl">
        <div className="text-center mb-16">
          <Heading as="h2" variant="section" className="mb-4">
            {t('marketing.roadmap.heading')}
          </Heading>
          <Text as="p" variant="lead" className="max-w-xl mx-auto">
            {t('marketing.roadmap.subtitle')}
          </Text>
        </div>
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 md:left-6 top-0 bottom-0 w-px bg-gradient-to-b from-lc-green/40 via-lc-green/20 to-lc-border" />

          <div className="space-y-8">
            {ROADMAP_PHASES.map((phase) => (
              <RoadmapPhase key={phase.key} phase={phase} />
            ))}
          </div>
        </div>
      </Container>
    </PageSection>
  );
}
