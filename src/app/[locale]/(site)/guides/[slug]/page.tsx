import { notFound } from 'next/navigation';
import { MDXRemote } from 'next-mdx-remote/rsc';
import remarkGfm from 'remark-gfm';
import { guidePath } from '@/utils/guides/guide-urls';
import ArticleShell from '@/components/guides/article/ArticleShell';
import { mdxComponents } from '@/components/guides/mdx/mdx-components';
import RelatedGuides from '@/components/guides/article/RelatedGuides';
import { SHOT_META } from '@/constants/guides/shots';
import JsonLd from '@/components/seo/JsonLd';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { LOCALES } from '@/i18n';
import { listSlugs, estimateReadMinutes } from '@/services/guides/guides';
import { cachedGuide } from '@/services/guides/cached-guides';
import { guideMetadata, guideJsonLd } from '@/utils/seo/guide';

export const dynamicParams = false;

type Params = { params: Promise<{ slug: string }> };

/** Slugs are shared across languages, so every locale gets every slug. */
export async function generateStaticParams() {
  const slugs = await listSlugs('en');
  return LOCALES.flatMap((locale) => slugs.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const locale = await getLocale();
  const { slug } = await params;
  const guide = await cachedGuide(locale, slug);
  // No guide: the page answers 404 and the not-found page names itself.
  if (!guide) return {};
  return guideMetadata({ locale, slug, fm: guide.frontmatter, t: await getTranslations({ locale }) });
}

export default async function Page({ params }: Params) {
  const locale = await getLocale();
  const { slug } = await params;
  const guide = await cachedGuide(locale, slug);
  if (!guide) notFound();

  const fm = guide.frontmatter;
  const t = await getTranslations({ locale });
  const readMinutes = fm.readMinutes ?? estimateReadMinutes(guide.content);
  const jsonLd = guideJsonLd({
    locale,
    slug,
    fm,
    content: guide.content,
    t,
    shots: SHOT_META,
    homeName: 'Obelisk',
    guidesName: t('guides.index.title'),
  });

  return (
    <div className="min-h-screen">

      {jsonLd.map((data, i) => <JsonLd key={i} data={data} />)}
      <ArticleShell
        frontmatter={fm}
        locale={locale}
        slug={slug}
        readMinutes={readMinutes}
        backHref={guidePath()}
        backLabel={t('guides.article.back')}
        readTimeLabel={t('guides.article.readTime')}
        updatedLabel={t('guides.article.updated')}
      >
        <MDXRemote
          source={guide.content}
          components={{
            ...mdxComponents,
            RelatedGuides: (props: { items: Array<{ slug: string; note?: string }> }) => (
              <RelatedGuides locale={locale} {...props} />
            ),
          }}
          options={{ mdxOptions: { remarkPlugins: [remarkGfm] } }}
        />
      </ArticleShell>

    </div>
  );
}
