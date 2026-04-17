import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Locale } from '@/i18n';
import { listAllGuides } from '@/lib/guides';
import GuideCard from '@/components/guides/GuideCard';
import GuideLocaleSync from '@/components/guides/GuideLocaleSync';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

const SITE_URL = process.env.CORS_ORIGIN || 'https://obelisk.ar';
const LOCALES: Locale[] = ['en', 'es'];

function isLocale(x: string): x is Locale {
  return x === 'en' || x === 'es';
}

export async function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

const COPY: Record<Locale, Record<string, string>> = {
  en: {
    title: 'Guides',
    subtitle:
      "Everything about Obelisk — what it is, how it works, and where it's going. Written plain, no jargon walls.",
    heading: 'Obelisk Guides',
    seoTitle: 'Guides · Obelisk',
    seoDescription:
      'Long-form guides about Obelisk, Nostr identity, Web of Trust spam resistance, and relay-based Nostr groups.',
    backHome: '← Back to home',
    empty: 'No guides yet.',
  },
  es: {
    title: 'Guías',
    subtitle:
      'Todo sobre Obelisk — qué es, cómo funciona, a dónde va. Escrito en lenguaje claro, sin paredes de jerga.',
    heading: 'Guías de Obelisk',
    seoTitle: 'Guías · Obelisk',
    seoDescription:
      'Guías largas sobre Obelisk, identidad Nostr, resistencia a spam por Red de Confianza, y grupos Nostr basados en relays.',
    backHome: '← Volver al inicio',
    empty: 'Todavía no hay guías.',
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const c = COPY[locale];
  const canonical = `/guides/${locale}`;
  return {
    title: c.seoTitle,
    description: c.seoDescription,
    alternates: {
      canonical,
      languages: {
        en: '/guides/en',
        es: '/guides/es',
        'x-default': '/guides/en',
      },
    },
    openGraph: {
      title: c.seoTitle,
      description: c.seoDescription,
      url: `${SITE_URL}${canonical}`,
      siteName: 'Obelisk',
      locale: locale === 'en' ? 'en_US' : 'es_AR',
      alternateLocale: locale === 'en' ? ['es_AR'] : ['en_US'],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: c.seoTitle,
      description: c.seoDescription,
    },
  };
}

export default async function GuidesIndex({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const guides = await listAllGuides(locale);
  const copy = COPY[locale];

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Obelisk',
        item: SITE_URL,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: copy.title,
        item: `${SITE_URL}/guides/${locale}`,
      },
    ],
  };

  return (
    <div className="min-h-screen bg-lc-black lc-grid-bg">
      <GuideLocaleSync locale={locale} />
      <Navbar />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      <main className="max-w-6xl mx-auto px-6 pt-28 pb-24">
        <div className="mb-10">
          <Link
            href="/"
            className="text-sm text-lc-muted hover:text-lc-green transition-colors"
          >
            {copy.backHome}
          </Link>
          <div className="mt-4">
            <h1 className="text-4xl md:text-5xl font-extrabold text-lc-white tracking-tight">
              {copy.heading}
            </h1>
            <p className="mt-3 text-lg text-lc-muted max-w-2xl">{copy.subtitle}</p>
          </div>
        </div>

        {guides.length === 0 ? (
          <p className="text-lc-muted">{copy.empty}</p>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {guides.map((g) => (
              <GuideCard key={g.slug} slug={g.slug} locale={locale} frontmatter={g.frontmatter} />
            ))}
          </div>
        )}
      </main>
      <Footer localeOverride={locale} />
    </div>
  );
}
