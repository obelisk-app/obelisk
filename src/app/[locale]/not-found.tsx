import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

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
