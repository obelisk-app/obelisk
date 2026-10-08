import List from '@/components/ui/layout/List';
import Container from '@/components/ui/layout/Container';
import Card from '@/components/ui/layout/Card';
import Link from '@/components/ui/navigation/Link';
import { LOCAL_DATA_CATEGORIES } from '@/constants/local-data/categories';
import type { MessageKey } from '@/i18n/keys';
import Section from '@/components/ui/layout/Section';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { standardPageMetadata } from '@/utils/seo/standard';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations({ locale });
  return standardPageMetadata(t, locale, 'helpLocalData');
}

const WHY: ReadonlyArray<MessageKey> = [
  'help.localData.why.speed',
  'help.localData.why.place',
  'help.localData.why.login',
  'help.localData.why.offline',
];

const BROWSERS: ReadonlyArray<MessageKey> = [
  'help.localData.other.chrome',
  'help.localData.other.firefox',
  'help.localData.other.safari',
  'help.localData.other.ios',
  'help.localData.other.android',
];

/** `/help/local-data`: what the app keeps in the browser, why, and every way to remove it. */
export default async function Page() {
  const t = await getTranslations();
  return (
    <div className="min-h-screen">

      <Container width="3xl" as="main" className="px-6 pb-24 pt-28" data-testid="local-data-help">
        <Link href="/help" variant="text" className="text-sm font-medium">
          {t('help.localData.back')}
        </Link>
        <Heading as="h1" variant="page" className="mt-5">
          {t('help.localData.title')}
        </Heading>
        <Text as="p" variant="lead" className="mt-3">{t('help.localData.intro')}</Text>

        <Section variant="prose" title={t('help.localData.why.title')}>
          <List>
            {WHY.map((key) => <Text as="li" key={key}>{t(key)}</Text>)}
          </List>
        </Section>

        <Section variant="prose" title={t('help.localData.server.title')}>
          <Text as="p">{t('help.localData.server.body')}</Text>
        </Section>

        <Section variant="prose" title={t('help.localData.categories.title')} data-testid="local-data-help-categories">
          <dl className="space-y-4">
            {LOCAL_DATA_CATEGORIES.map((category) => (
              <Card variant="interactive" padding="lg" key={category.id}>
                <dt className="font-semibold text-lc-white">{t(category.titleKey)}</dt>
                <dd className="mt-1">{t(category.purposeKey)}</dd>
              </Card>
            ))}
          </dl>
          <Text as="p" size="sm" className="mt-4">{t('help.localData.categories.perAccount')}</Text>
        </Section>

        <Section variant="prose" title={t('help.localData.settings.title')}>
          <Text as="p">{t('help.localData.settings.body')}</Text>
        </Section>

        <Section variant="prose" title={t('help.localData.other.title')} data-testid="local-data-help-other">
          <List spacing="none" className="space-y-3">
            <Text as="li">{t('help.localData.other.logout')}</Text>
            <Text as="li">
              {t('help.localData.other.browser')}
              <List marker="circle" spacing="normal" className="mt-2">
                {BROWSERS.map((key) => <Text as="li" key={key}>{t(key)}</Text>)}
              </List>
            </Text>
            <Text as="li">{t('help.localData.other.private')}</Text>
          </List>
        </Section>

        <Section variant="prose" title={t('help.localData.published.title')}>
          <Text as="p">{t('help.localData.published.body')}</Text>
        </Section>
      </Container>

    </div>
  );
}
