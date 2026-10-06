import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { DEFAULT_LOCALE, isLocale } from '@/i18n';
import { Link } from '@/i18n/navigation';
import { NOINDEX } from '@/utils/seo/page';

/**
 * The 404's own title, in the URL's language, and `noindex` stated here too:
 * without it the page inherited the layout's home-page title. (Next.js
 * answers 404 and adds its own `noindex`; the localized body below is drawn
 * once the page hydrates, which is how Next 16 renders a `notFound()`.)
 */
export async function generateMetadata({ params }: { params: Promise<{ locale?: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: isLocale(locale) ? locale : DEFAULT_LOCALE });
  return { title: t('seo.notFound.title'), description: t('seo.notFound.description'), robots: NOINDEX };
}

/** 404 inside a language: the copy is in that language, the home link stays in it. */
export default async function NotFound() {
  const t = await getTranslations();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-bold text-lc-white">{t('common.notFound.title')}</h1>
      <p className="max-w-md text-lc-muted">{t('common.notFound.body')}</p>
      <Link href="/" className="lc-pill lc-pill-primary px-6 py-2 text-sm">{t('common.notFound.home')}</Link>
    </main>
  );
}
