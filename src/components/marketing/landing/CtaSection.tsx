'use client';

import PageSection from '@/components/ui/layout/PageSection';
import Container from '@/components/ui/layout/Container';
import Card from '@/components/ui/layout/Card';
import { useTranslations } from 'next-intl';
import Button from '@/components/ui/buttons/Button';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

/**
 * The closing call to action.
 */
export default function CtaSection({ onLaunch }: { onLaunch: () => void }) {
  const t = useTranslations();
  return (
    <PageSection reveal>
      <Container width="3xl" centeredText>
        <Card variant="interactive" glow padding="hero">
          <Heading as="h2" variant="section" accent="?" className="mb-4">
            {t('marketing.cta.heading')}
          </Heading>
          <Text as="p" variant="lead" className="mb-8 max-w-lg mx-auto">
            {t('marketing.cta.subtitle')}
          </Text>
          <Button variant="pill" size="lg" onClick={() => onLaunch()}>
            {t('marketing.cta.button')}
          </Button>
        </Card>
      </Container>
    </PageSection>
  );
}
