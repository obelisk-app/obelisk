import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LOCALES } from '@/i18n';
import IntlScope from '@/i18n/IntlScope';
import { pageLocale, type LocaleParams } from '@/i18n/page-locale';
import GuideArticlePage from '@/components/guides/article/GuideArticlePage';
import { listSlugs, readGuideOrNull } from '@/services/guides/guides';
import { guideMetadata } from '@/utils/seo/guide';

type Params = LocaleParams<{ slug: string }>;

/** Slugs are shared across languages, so every locale gets every slug. */
export async function generateStaticParams() {
  const slugs = await listSlugs('en');
  return LOCALES.flatMap((locale) => slugs.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const locale = await pageLocale(params);
  const { slug } = await params;
  const guide = await readGuideOrNull(locale, slug);
  // No guide: the page answers 404 and the not-found page names itself.
  if (!guide) return {};
  return guideMetadata({ locale, slug, fm: guide.frontmatter, t: await getTranslations({ locale }) });
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
