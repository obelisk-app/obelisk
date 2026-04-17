import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MDXRemote } from 'next-mdx-remote/rsc';
import remarkGfm from 'remark-gfm';
import type { Locale } from '@/i18n';
import {
  listSlugs,
  readGuide,
  estimateReadMinutes,
  type GuideFrontmatter,
} from '@/lib/guides';
import ArticleShell from '@/components/guides/ArticleShell';
import GuideLocaleSync from '@/components/guides/GuideLocaleSync';
import { mdxComponents } from '@/components/guides/mdx-components';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

const SITE_URL = process.env.CORS_ORIGIN || 'https://obelisk.ar';
const LOCALES: Locale[] = ['en', 'es'];

function isLocale(x: string): x is Locale {
  return x === 'en' || x === 'es';
}

const CHROME: Record<Locale, Record<string, string>> = {
  en: {
    back: 'All guides',
    readTime: 'min read',
    updated: 'Updated',
  },
  es: {
    back: 'Todas las guías',
    readTime: 'min de lectura',
    updated: 'Actualizado',
  },
};

export async function generateStaticParams() {
  const params: { locale: string; slug: string }[] = [];
  for (const locale of LOCALES) {
    const slugs = await listSlugs(locale);
    for (const slug of slugs) params.push({ locale, slug });
  }
  return params;
}

async function safeRead(locale: Locale, slug: string) {
  try {
    return await readGuide(locale, slug);
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const guide = await safeRead(locale, slug);
  if (!guide) return {};

  const fm = guide.frontmatter as GuideFrontmatter;
  const canonical = `/guides/${locale}/${slug}`;

  return {
    title: fm.title,
    description: fm.description,
    alternates: {
      canonical,
      languages: {
        en: `/guides/en/${slug}`,
        es: `/guides/es/${slug}`,
        'x-default': `/guides/en/${slug}`,
      },
    },
    openGraph: {
      title: fm.title,
      description: fm.description,
      url: `${SITE_URL}${canonical}`,
      siteName: 'Obelisk',
      locale: locale === 'en' ? 'en_US' : 'es_AR',
      alternateLocale: locale === 'en' ? ['es_AR'] : ['en_US'],
      type: 'article',
      publishedTime: fm.publishedAt,
      modifiedTime: fm.updatedAt,
      tags: fm.tags,
    },
    twitter: {
      card: 'summary_large_image',
      title: fm.title,
      description: fm.description,
    },
    keywords: fm.tags,
  };
}

export default async function GuideArticle({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();

  const guide = await safeRead(locale, slug);
  if (!guide) notFound();

  const fm = guide.frontmatter as GuideFrontmatter;
  const chrome = CHROME[locale];
  const readMinutes = fm.readMinutes ?? estimateReadMinutes(guide.content);

  const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: fm.title,
    description: fm.description,
    datePublished: fm.publishedAt,
    dateModified: fm.updatedAt,
    inLanguage: locale === 'en' ? 'en' : 'es-AR',
    image: `${SITE_URL}/guides/${locale}/${slug}/opengraph-image`,
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
        url: `${SITE_URL}/obelisk.png`,
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${SITE_URL}/guides/${locale}/${slug}`,
    },
    keywords: fm.tags?.join(', '),
  };

  return (
    <div className="min-h-screen bg-lc-black lc-grid-bg">
      <GuideLocaleSync locale={locale} />
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
        backHref={`/guides/${locale}`}
        backLabel={chrome.back}
        readTimeLabel={chrome.readTime}
        updatedLabel={chrome.updated}
      >
        <MDXRemote
          source={guide.content}
          components={mdxComponents}
          options={{ mdxOptions: { remarkPlugins: [remarkGfm] } }}
        />
      </ArticleShell>
      <Footer localeOverride={locale} />
    </div>
  );
}
