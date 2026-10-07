'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import Footer from '@/components/marketing/site/Footer';
import Navbar from '@/components/marketing/site/Navbar';
import { LOCAL_DATA_CATEGORIES } from '@/services/local-data/categories';
import type { MessageKey } from '@/i18n/keys';
import LocalDataHelpSection from './LocalDataHelpSection';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

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

/**
 * The `/help/local-data` page: what Obelisk keeps in the browser and why,
 * that none of it reaches an Obelisk server, and every way to remove it.
 * The category list is the same one Settings > Data on this device shows.
 */
export default function LocalDataHelp() {
  const t = useTranslations();
  return (
    <div className="min-h-screen bg-lc-black lc-grid-bg">
      <Navbar />
      <main className="mx-auto max-w-3xl px-6 pb-24 pt-28" data-testid="local-data-help">
        <Link href="/help" className="text-sm font-medium text-lc-green hover:text-lc-green-dark">
          {t('help.localData.back')}
        </Link>
        <Heading as="h1" variant="page" className="mt-5">
          {t('help.localData.title')}
        </Heading>
        <Text as="p" variant="lead" className="mt-3">{t('help.localData.intro')}</Text>

        <LocalDataHelpSection title={t('help.localData.why.title')}>
          <ul className="list-disc space-y-2 pl-5">
            {WHY.map((key) => <li key={key}>{t(key)}</li>)}
          </ul>
        </LocalDataHelpSection>

        <LocalDataHelpSection title={t('help.localData.server.title')}>
          <Text as="p">{t('help.localData.server.body')}</Text>
        </LocalDataHelpSection>

        <LocalDataHelpSection title={t('help.localData.categories.title')} testId="local-data-help-categories">
          <dl className="space-y-4">
            {LOCAL_DATA_CATEGORIES.map((category) => (
              <div key={category.id} className="lc-card p-4">
                <dt className="font-semibold text-lc-white">{t(category.titleKey)}</dt>
                <dd className="mt-1">{t(category.purposeKey)}</dd>
              </div>
            ))}
          </dl>
          <Text as="p" size="sm" className="mt-4">{t('help.localData.categories.perAccount')}</Text>
        </LocalDataHelpSection>

        <LocalDataHelpSection title={t('help.localData.settings.title')}>
          <Text as="p">{t('help.localData.settings.body')}</Text>
        </LocalDataHelpSection>

        <LocalDataHelpSection title={t('help.localData.other.title')} testId="local-data-help-other">
          <ul className="list-disc space-y-3 pl-5">
            <li>{t('help.localData.other.logout')}</li>
            <li>
              {t('help.localData.other.browser')}
              <ul className="mt-2 list-[circle] space-y-2 pl-5">
                {BROWSERS.map((key) => <li key={key}>{t(key)}</li>)}
              </ul>
            </li>
            <li>{t('help.localData.other.private')}</li>
          </ul>
        </LocalDataHelpSection>

        <LocalDataHelpSection title={t('help.localData.published.title')}>
          <Text as="p">{t('help.localData.published.body')}</Text>
        </LocalDataHelpSection>
      </main>
      <Footer />
    </div>
  );
}
