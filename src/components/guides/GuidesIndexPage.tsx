import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n';
import { listAllGuides } from '@/services/guides';
import { guidePath } from '@/utils/guides/guide-urls';
import { absoluteUrl, localizedAlternates, ogLocales } from '@/utils/seo/alternates';
import GuideCard from '@/components/guides/GuideCard';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';

export async function buildGuidesIndexMetadata(locale: Locale): Promise<Metadata> {
  const t = await getTranslations({ locale });
  const title = t('seo.guides.title');
  const description = t('seo.guides.description');
  return {
    title,
    description,
    alternates: localizedAlternates(locale, guidePath()),
    openGraph: {
      title,
      description,
      url: absoluteUrl(locale, guidePath()),
      siteName: 'Obelisk',
      ...ogLocales(locale),
      type: 'website',
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function GuidesIndexPage({ locale }: { locale: Locale }) {
  const guides = await listAllGuides(locale);
  const t = await getTranslations({ locale });

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Obelisk',
        item: absoluteUrl(locale, '/'),
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: t('guides.index.title'),
        item: absoluteUrl(locale, guidePath()),
      },
    ],
  };

  return (
    <div className="min-h-screen bg-lc-black lc-grid-bg">
      <Navbar />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      <main className="max-w-6xl mx-auto px-6 pt-28 pb-24">
        <div className="mb-10">
          <Link
            href="/"
            className="inline-flex items-center text-sm font-medium text-lc-green hover:text-lc-green-dark transition-colors"
          >
            {t('guides.index.backHome')}
          </Link>
          <div className="mt-4">
            <h1 className="text-4xl md:text-5xl font-extrabold text-lc-white tracking-tight">
              {t('guides.index.heading')}
            </h1>
            <p className="mt-3 text-lg text-lc-muted max-w-2xl">{t('guides.index.subtitle')}</p>
          </div>
        </div>

        {guides.length === 0 ? (
          <p className="text-lc-muted">{t('guides.index.empty')}</p>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {guides.map((g) => (
              <GuideCard key={g.slug} slug={g.slug} frontmatter={g.frontmatter} />
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
