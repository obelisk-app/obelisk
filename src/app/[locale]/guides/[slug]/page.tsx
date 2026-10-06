import type { Metadata } from 'next';
import { LOCALES } from '@/i18n';
import IntlScope from '@/i18n/IntlScope';
import { pageLocale, type LocaleParams } from '@/i18n/page-locale';
import GuideArticlePage, { buildGuideArticleMetadata } from '@/components/guides/GuideArticlePage';
import { listSlugs } from '@/services/guides';

type Params = LocaleParams<{ slug: string }>;

/** Slugs are shared across languages, so every locale gets every slug. */
export async function generateStaticParams() {
  const slugs = await listSlugs('en');
  return LOCALES.flatMap((locale) => slugs.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const locale = await pageLocale(params);
  const { slug } = await params;
  return buildGuideArticleMetadata(locale, slug);
}

export default async function Page({ params }: Params) {
  const locale = await pageLocale(params);
  const { slug } = await params;
  return (
    <IntlScope scope="guides">
      <GuideArticlePage locale={locale} slug={slug} />
    </IntlScope>
  );
}
