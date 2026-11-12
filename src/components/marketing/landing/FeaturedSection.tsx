import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';
import { useTranslations } from 'next-intl';
import PageSection from '@/components/ui/layout/PageSection';
import Container from '@/components/ui/layout/Container';
import Link from '@/components/ui/navigation/Link';

export default function FeaturedSection() {
  const t = useTranslations();
  return <PageSection><Container width="3xl" centeredText>
    <Heading as="h2" className="mb-3 text-sm uppercase tracking-widest text-lc-muted">{t('marketing.landing.featured.heading')}</Heading>
    <Text as="p" /* i18n-exempt: conference brand */ className="font-semibold text-lc-green">LABITCONF 2026</Text>
    <Text as="p" /* i18n-exempt: original conference talk title */ className="my-2 text-lg">Obelisk: El Discord sobre Nostr</Text>
    <Link href="https://www.labitconf.com/agenda?talk=1a155716-2f29-5227-b29a-654ccad7dc13" target="_blank" rel="noopener noreferrer">{t('marketing.landing.featured.cta')} →</Link>
  </Container></PageSection>;
}
