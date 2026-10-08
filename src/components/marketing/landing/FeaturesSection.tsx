import PageSection from '@/components/ui/layout/PageSection';
import Container from '@/components/ui/layout/Container';
import Card from '@/components/ui/layout/Card';
import { useTranslations } from 'next-intl';
import FeatureGlyph from './FeatureGlyph';
import { FEATURE_KEYS } from '@/constants/marketing/landing';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

/**
 * The feature grid.
 */
export default function FeaturesSection() {
  const t = useTranslations();
  return (
    <PageSection reveal id="features">
      <Container width="6xl">
        <div className="text-center mb-16">
          <Heading as="h2" variant="section" className="mb-4">
            {t('marketing.features.heading')}
          </Heading>
          <Text as="p" variant="lead" className="max-w-xl mx-auto">
            {t('marketing.features.subtitle')}
          </Text>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURE_KEYS.map((f) => (
            <Card variant="interactive" padding="2xl" key={f.titleKey} className="group">
              <div className="w-12 h-12 rounded-xl bg-lc-olive/50 flex items-center justify-center text-lc-green mb-4 group-hover:bg-lc-olive transition-colors">
                <FeatureGlyph feature={f.id} />
              </div>
              <Heading as="h3" variant="card" className="mb-2">{t(f.titleKey)}</Heading>
              <Text as="p" variant="muted" className="leading-relaxed">{t(f.descKey)}</Text>
            </Card>
          ))}
        </div>
      </Container>
    </PageSection>
  );
}
