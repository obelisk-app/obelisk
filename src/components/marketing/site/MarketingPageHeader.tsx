import type { ReactNode } from 'react';
import Container from '@/components/ui/layout/Container';
import Stack from '@/components/ui/layout/Stack';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

/** Shared introductory hierarchy for the feature catalogue and app tours. */
export default function MarketingPageHeader({ eyebrow, title, description, children }: {
  eyebrow: ReactNode;
  title: ReactNode;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <header className="px-6 pb-12 pt-32 text-center">
      <Container width="4xl" centeredText>
        <span className="inline-flex rounded-full border border-lc-green/20 bg-lc-olive/40 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-lc-green">{eyebrow}</span>
        <Heading as="h1" variant="display" className="mt-5">{title}</Heading>
        <Container width="2xl" className="mt-6">
          <Text as="p" variant="lead" className="leading-relaxed md:text-xl">{description}</Text>
        </Container>
        <Stack gap="3" className="mt-10 justify-center sm:flex-row">{children}</Stack>
      </Container>
    </header>
  );
}
