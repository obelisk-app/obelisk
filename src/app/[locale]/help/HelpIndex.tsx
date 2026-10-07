'use client';

import { Link } from '@/i18n/navigation';
import Footer from '@/components/marketing/site/Footer';
import Navbar from '@/components/marketing/site/Navbar';
import { guidePath } from '@/utils/guides/guide-urls';
import { HELP_TOPICS, helpTopicPath } from '@/utils/guides/help-topics';
import { useTranslations } from 'next-intl';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

/** The help index: one card per topic, then a link to every guide. */
export default function HelpIndex() {
  const t = useTranslations();

  return (
    <div className="min-h-screen bg-lc-black lc-grid-bg">
      <Navbar />
      <main className="mx-auto max-w-5xl px-6 pb-24 pt-28">
        <Link href="/app" className="text-sm font-medium text-lc-green hover:text-lc-green-dark">
          {t('help.back')}
        </Link>
        <Heading as="h1" variant="page" className="mt-5">
          {t('help.title')}
        </Heading>
        <Text as="p" variant="lead" className="mt-3 max-w-2xl">{t('help.subtitle')}</Text>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {HELP_TOPICS.map((topic) => (
            <Link
              key={topic.slug}
              href={helpTopicPath(topic)}
              data-testid={`help-topic-${topic.slug}`}
              className="lc-card group p-6 transition-colors hover:border-lc-green/50"
            >
              <Heading as="h2" variant="cardLink">{t(topic.titleKey)}</Heading>
              <Text as="p" variant="muted" className="mt-2 leading-6">{t(topic.descriptionKey)}</Text>
            </Link>
          ))}
        </div>

        <Link
          href={guidePath()}
          className="lc-pill-primary mt-8 inline-flex px-6 py-3 text-sm font-semibold"
        >
          {t('help.all')}
        </Link>
      </main>
      <Footer />
    </div>
  );
}
