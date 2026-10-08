import type { ReactNode } from 'react';
import Card from '@/components/ui/layout/Card';
import Container from '@/components/ui/layout/Container';
import PageSection from '@/components/ui/layout/PageSection';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

/** Shared closing call to action for the feature catalogue and app tours. */
export default function MarketingCta({ title, description, children }: {
  title: ReactNode;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <PageSection>
      <Container width="3xl" centeredText>
        <Card variant="interactive" glow padding="heroResponsive">
          <Heading as="h2" variant="section" className="mb-4">{title}</Heading>
          <Container width="lg" className="mb-8">
            <Text as="p" variant="lead">{description}</Text>
          </Container>
          {children}
        </Card>
      </Container>
    </PageSection>
  );
}
