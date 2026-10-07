import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n';
import { listAllGuides } from '@/services/guides/guides';
import { guidePath } from '@/utils/guides/guide-urls';
import { absoluteUrl } from '@/utils/seo/alternates';
import { breadcrumbJsonLd, collectionJsonLd } from '@/utils/seo/jsonld';
import GuideCard from '@/components/guides/listing/GuideCard';
import Navbar from '@/components/marketing/site/Navbar';
import Footer from '@/components/marketing/site/Footer';
import JsonLd from '@/components/seo/JsonLd';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

export default async function GuidesIndexPage({ locale }: { locale: Locale }) {
  const guides = await listAllGuides(locale);
  const t = await getTranslations({ locale });

  const url = absoluteUrl(locale, guidePath());
  const breadcrumb = breadcrumbJsonLd([
    { name: 'Obelisk', url: absoluteUrl(locale, '/') },
    { name: t('guides.index.title'), url },
  ]);
  const collection = collectionJsonLd({
    locale,
    url,
    name: t('guides.index.heading'),
    description: t('guides.index.subtitle'),
    items: guides.map((g) => ({ name: g.frontmatter.title, url: absoluteUrl(locale, guidePath(g.slug)) })),
  });

  return (
    <div className="min-h-screen bg-lc-black lc-grid-bg">
      <Navbar />
      <JsonLd data={collection} />
      <JsonLd data={breadcrumb} />

      <main className="max-w-6xl mx-auto px-6 pt-28 pb-24">
        <div className="mb-10">
          <Link
            href="/"
            className="inline-flex items-center text-sm font-medium text-lc-green hover:text-lc-green-dark transition-colors"
          >
            {t('guides.index.backHome')}
          </Link>
          <div className="mt-4">
            <Heading as="h1" variant="page">
              {t('guides.index.heading')}
            </Heading>
            <Text as="p" variant="lead" className="mt-3 max-w-2xl">{t('guides.index.subtitle')}</Text>
          </div>
        </div>

        {guides.length === 0 ? (
          <Text as="p" tone="muted">{t('guides.index.empty')}</Text>
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
