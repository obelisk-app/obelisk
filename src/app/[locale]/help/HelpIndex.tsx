'use client';

import { Link } from '@/i18n/navigation';
import Footer from '@/components/marketing/Footer';
import Navbar from '@/components/marketing/Navbar';
import { guidePath } from '@/utils/guides/guide-urls';
import { HELP_TOPICS, helpTopicPath } from '@/utils/guides/help-topics';
import { useTranslations } from 'next-intl';

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
        <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-lc-white md:text-5xl">
          {t('help.title')}
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-lc-muted">{t('help.subtitle')}</p>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {HELP_TOPICS.map((topic) => (
            <Link
              key={topic.slug}
              href={helpTopicPath(topic)}
              data-testid={`help-topic-${topic.slug}`}
              className="lc-card group p-6 transition-colors hover:border-lc-green/50"
            >
              <h2 className="text-lg font-bold text-lc-white group-hover:text-lc-green">{t(topic.titleKey)}</h2>
              <p className="mt-2 text-sm leading-6 text-lc-muted">{t(topic.descriptionKey)}</p>
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
