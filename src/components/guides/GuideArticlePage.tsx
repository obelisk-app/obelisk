import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MDXRemote } from 'next-mdx-remote/rsc';
import remarkGfm from 'remark-gfm';
import { getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n';
import {
  readGuide,
  estimateReadMinutes,
  type GuideFrontmatter,
} from '@/services/guides';
import { guidePath } from '@/utils/guides/guide-urls';
import { HREFLANG, SITE_URL, absoluteUrl, localizedAlternates, ogLocales } from '@/utils/seo/alternates';
import ArticleShell from '@/components/guides/ArticleShell';
import { mdxComponents } from '@/components/guides/mdx-components';
import RelatedGuides from '@/components/guides/RelatedGuides';
import {
  HERO_ASSET_META,
  DIAGRAM_ASSET_META,
  snapshotPaths,
} from '@/utils/guides/asset-meta';
import type { MessageKey } from '@/i18n/keys';
import { SHOT_META, shotPath } from '@/components/guides/Shot';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';

const ASSET_REF_RE = /<(?:Diagram|SvgHero)\s+[^>]*name=["']([^"']+)["']/g;
/** Screenshots are PNGs on disk rather than rendered SVGs, so they resolve
 *  through their own map - but they belong in the article's image list all
 *  the same, which is the whole point of shipping them with alt text. */
const SHOT_REF_RE = /<Shot\s+[^>]*name=["']([^"']+)["']/g;

function collectGuideImages(
  heroName: string | undefined,
  content: string,
  siteUrl: string,
  locale: Locale,
): Array<{ url: string; width: number; height: number; altKey: MessageKey }> {
  const names = new Set<string>();
  if (heroName) names.add(heroName);
  for (const m of content.matchAll(ASSET_REF_RE)) names.add(m[1]);
  const out: Array<{ url: string; width: number; height: number; altKey: MessageKey }> = [];
  for (const n of names) {
    const meta = HERO_ASSET_META[n] ?? DIAGRAM_ASSET_META[n];
    if (!meta) continue;
    out.push({ url: `${siteUrl}${snapshotPaths(n, locale).png}`, ...meta });
  }
  for (const m of content.matchAll(SHOT_REF_RE)) {
    const meta = SHOT_META[m[1]];
    if (!meta) continue;
    out.push({ url: `${siteUrl}${shotPath(m[1])}`, ...meta });
  }
  return out;
}

async function safeRead(locale: Locale, slug: string) {
  try {
    return await readGuide(locale, slug);
  } catch {
    return null;
  }
}

export async function buildGuideArticleMetadata(
  locale: Locale,
  slug: string,
): Promise<Metadata> {
  const guide = await safeRead(locale, slug);
  if (!guide) return {};

  const fm = guide.frontmatter as GuideFrontmatter;
  const t = await getTranslations({ locale });
  const canonical = absoluteUrl(locale, guidePath(slug));
  const heroMeta = HERO_ASSET_META[fm.heroComponent];
  const heroUrl = heroMeta
    ? `${SITE_URL}${snapshotPaths(fm.heroComponent, locale).png}`
    : `${canonical}/opengraph-image`;
  const heroWidth = heroMeta ? heroMeta.width * 2 : 1200;
  const heroHeight = heroMeta ? heroMeta.height * 2 : 630;
  const heroAlt = heroMeta ? t(heroMeta.altKey) : fm.title;

  return {
    title: fm.title,
    description: fm.description,
    alternates: localizedAlternates(locale, guidePath(slug)),
    openGraph: {
      title: fm.title,
      description: fm.description,
      url: canonical,
      siteName: 'Obelisk',
      ...ogLocales(locale),
      type: 'article',
      publishedTime: fm.publishedAt,
      modifiedTime: fm.updatedAt,
      tags: fm.tags,
      images: [
        {
          url: heroUrl,
          width: heroWidth,
          height: heroHeight,
          alt: heroAlt,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: fm.title,
      description: fm.description,
      images: [heroUrl],
    },
    keywords: fm.tags,
  };
}

export default async function GuideArticlePage({
  locale,
  slug,
}: {
  locale: Locale;
  slug: string;
}) {
  const guide = await safeRead(locale, slug);
  if (!guide) notFound();

  const fm = guide.frontmatter as GuideFrontmatter;
  const t = await getTranslations({ locale });
  const readMinutes = fm.readMinutes ?? estimateReadMinutes(guide.content);
  const canonical = absoluteUrl(locale, guidePath(slug));

  const guideImages = collectGuideImages(fm.heroComponent, guide.content, SITE_URL, locale);
  const heroMeta = HERO_ASSET_META[fm.heroComponent];
  const heroUrl = heroMeta
    ? `${SITE_URL}${snapshotPaths(fm.heroComponent, locale).png}`
    : `${canonical}/opengraph-image`;
  const heroWidth = heroMeta ? heroMeta.width * 2 : 1200;
  const heroHeight = heroMeta ? heroMeta.height * 2 : 630;
  const heroAlt = heroMeta ? t(heroMeta.altKey) : fm.title;

  const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: fm.title,
    description: fm.description,
    datePublished: fm.publishedAt,
    dateModified: fm.updatedAt,
    inLanguage: HREFLANG[locale],
    image: [
      {
        '@type': 'ImageObject',
        url: heroUrl,
        width: heroWidth,
        height: heroHeight,
        caption: heroAlt,
      },
      ...guideImages
        .filter((img) => img.url !== heroUrl)
        .map((img) => ({
          '@type': 'ImageObject',
          url: img.url,
          width: img.width * 2,
          height: img.height * 2,
          caption: t(img.altKey),
        })),
    ],
    author: {
      '@type': 'Organization',
      name: 'La Crypta',
      url: 'https://lacrypta.ar',
    },
    publisher: {
      '@type': 'Organization',
      name: 'La Crypta',
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/icon-512.png`,
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': canonical,
    },
    keywords: fm.tags?.join(', '),
  };

  return (
    <div className="min-h-screen bg-lc-black lc-grid-bg">
      <Navbar />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }}
      />
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
