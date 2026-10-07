import { notFound } from 'next/navigation';
import { MDXRemote } from 'next-mdx-remote/rsc';
import remarkGfm from 'remark-gfm';
import { getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n';
import { estimateReadMinutes, readGuideOrNull } from '@/services/guides/guides';
import { guidePath } from '@/utils/guides/guide-urls';
import { guideJsonLd } from '@/utils/seo/guide';
import ArticleShell from '@/components/guides/article/ArticleShell';
import { mdxComponents } from '@/components/guides/mdx/mdx-components';
import RelatedGuides from '@/components/guides/article/RelatedGuides';
import { SHOT_META } from '@/constants/guides/shots';
import Navbar from '@/components/marketing/site/Navbar';
import Footer from '@/components/marketing/site/Footer';
import JsonLd from '@/components/seo/JsonLd';

export default async function GuideArticlePage({
  locale,
  slug,
}: {
  locale: Locale;
  slug: string;
}) {
  const guide = await readGuideOrNull(locale, slug);
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
    <div className="min-h-screen bg-lc-black lc-grid-bg">
      <Navbar />
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
      <Footer />
    </div>
  );
}
