import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { DEFAULT_LOCALE } from '@/i18n';
import { NOINDEX, renderedTitle } from '@/utils/seo/page';

/**
 * A request no route matched and the proxy never localised (`/dev/...` in
 * production, a path with a file extension). It renders outside `[locale]`,
 * so it owns `<html>`, and there is no language in the URL: English.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: DEFAULT_LOCALE });
  return { title: renderedTitle(t('seo.notFound.title')), description: t('seo.notFound.description'), robots: NOINDEX };
}

export default async function RootNotFound() {
  const t = await getTranslations({ locale: DEFAULT_LOCALE });
  return (
    <html lang={DEFAULT_LOCALE}>
      <body style={{ fontFamily: 'system-ui, sans-serif', textAlign: 'center', paddingTop: '20vh' }}>
        <h1>{t('common.notFound.title')}</h1>
        <p>{t('common.notFound.body')}</p>
      </body>
    </html>
  );
}
