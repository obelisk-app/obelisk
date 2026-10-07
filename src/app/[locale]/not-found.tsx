import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { NOINDEX } from '@/constants/seo/page';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

/**
 * The 404's own title, in the URL's language, and `noindex` stated here too:
 * without it the page inherited the layout's home-page title. (Next.js
 * answers 404 and adds its own `noindex`; the localized body below is drawn
 * once the page hydrates, which is how Next 16 renders a `notFound()`.)
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t('seo.notFound.title'), description: t('seo.notFound.description'), robots: NOINDEX };
}

/** 404 inside a language: the copy is in that language, the home link stays in it. */
export default async function NotFound() {
  const t = await getTranslations();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <Heading as="h1" className="text-3xl font-bold text-lc-white">{t('common.notFound.title')}</Heading>
      <Text as="p" tone="muted" className="max-w-md">{t('common.notFound.body')}</Text>
      <Link href="/" className="lc-pill lc-pill-primary px-6 py-2 text-sm">{t('common.notFound.home')}</Link>
    </main>
  );
}
