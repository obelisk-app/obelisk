import { useTranslations } from 'next-intl';
import { ExternalIcon } from '@/assets/icons';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';
import Card from '@/components/ui/layout/Card';
import PageSection from '@/components/ui/layout/PageSection';
import Container from '@/components/ui/layout/Container';
import Link from '@/components/ui/navigation/Link';

export default function FeaturedSection() {
  const t = useTranslations();
  return (
    <PageSection id="featured">
      <Container width="4xl">
        <Heading as="h2" variant="label" className="mb-5">
          {t('marketing.landing.featured.heading')}
        </Heading>
        <Card as="article" padding="3xl" radius="2xl" className="relative overflow-hidden border-lc-green/25">
          <div aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-lc-green" />
          <div className="flex flex-col gap-7 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <Text as="p" size="xs" weight="bold" tone="accent" variant="label" className="mb-3">{/* i18n-exempt: conference brand */}LABITCONF 2026</Text>
              <Heading as="h3" className="max-w-xl text-2xl font-bold leading-tight tracking-tight text-lc-white sm:text-3xl">{/* i18n-exempt: original conference talk title */}Obelisk: El Discord sobre Nostr</Heading>
            </div>
            <Link
              href="https://www.labitconf.com/agenda?talk=1a155716-2f29-5227-b29a-654ccad7dc13"
              target="_blank"
              rel="noopener noreferrer"
              variant="button"
              buttonVariant="pillSecondary"
              size="md"
              className="inline-flex shrink-0 items-center justify-center gap-2 self-start sm:self-center"
            >
              {t('marketing.landing.featured.cta')}
              <ExternalIcon size={16} />
            </Link>
          </div>
        </Card>
      </Container>
    </PageSection>
  );
}
