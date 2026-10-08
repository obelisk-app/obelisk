import PageSection from '@/components/ui/layout/PageSection';
import Container from '@/components/ui/layout/Container';
import Card from '@/components/ui/layout/Card';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { guidePath } from '@/utils/guides/guide-urls';
import { LEARN_GUIDES } from '@/constants/marketing/landing';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

/**
 * The guide cards and the link to every guide.
 */
export default function LearnSection() {
  const t = useTranslations();
  return (
    <PageSection reveal id="learn">
      <Container width="6xl">
        <div className="text-center mb-16">
          <Heading as="h2" variant="section" className="mb-4">
            {t('marketing.learn.heading')}
          </Heading>
          <Text as="p" variant="lead" className="max-w-xl mx-auto">
            {t('marketing.learn.subtitle')}
          </Text>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {LEARN_GUIDES.map((g) => (
            <Card variant="interactive" padding="2xl" key={g.slug} asChild>
              <Link
                href={guidePath(g.slug)}
                className="group"
              >
                <Heading as="h3" variant="cardLink">
                  {t(`marketing.learn.card.${g.tKey}.title`)}
                </Heading>
                <Text as="p" variant="muted" className="mt-2">
                  {t(`marketing.learn.card.${g.tKey}.desc`)}
                </Text>
                <div className="mt-4 text-xs text-lc-green font-semibold">
                  {t('marketing.learn.cta')} →
                </div>
              </Link>
            </Card>
          ))}
        </div>
        <div className="mt-10 text-center">
          <Link
            href={guidePath()}
            className="lc-pill lc-pill-secondary text-sm inline-flex items-center gap-2"
          >
            {t('marketing.learn.cta')} <span aria-hidden="true">→</span>
          </Link>
        </div>
      </Container>
    </PageSection>
  );
}
