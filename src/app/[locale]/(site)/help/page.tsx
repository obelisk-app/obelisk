import Container from '@/components/ui/layout/Container';
import Card from '@/components/ui/layout/Card';
import Link from '@/components/ui/navigation/Link';
import { guidePath } from '@/utils/guides/guide-urls';
import { helpTopicPath } from '@/utils/guides/help-topics';
import { HELP_TOPICS } from '@/constants/guides/help-topics';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { standardPageMetadata } from '@/utils/seo/standard';

/**
 * In the page, not the help layout: a layout's own title replaces the root
 * template for every page under it.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return standardPageMetadata(await getTranslations({ locale }), locale, 'help', {
    // Search terms, not copy (docs/i18n.md): they stay English.
    keywords: [
      'Obelisk help', 'Nostr chat help', 'Nostr login guide', 'NIP-29 community guide',
      'Nostr relay help', 'Bitcoin zaps guide',
    ],
  });
}

export default async function Page() {
  const t = await getTranslations();

  return (
    <div className="min-h-screen bg-lc-black lc-grid-bg">

      <Container width="5xl" as="main" className="px-6 pb-24 pt-28">
        <Link href="/app" prefetch={false} variant="text" className="text-sm font-medium">
          {t('help.back')}
        </Link>
        <Heading as="h1" variant="page" className="mt-5">
          {t('help.title')}
        </Heading>
        <Text as="p" variant="lead" className="mt-3 max-w-2xl">{t('help.subtitle')}</Text>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {HELP_TOPICS.map((topic) => (
            <Card variant="interactive" padding="2xl" key={topic.slug} asChild>
              <Link
                href={helpTopicPath(topic)}
                data-testid={`help-topic-${topic.slug}`}
                variant="card" className="group"
              >
                <Heading as="h2" variant="cardLink">{t(topic.titleKey)}</Heading>
                <Text as="p" variant="muted" className="mt-2 leading-6">{t(topic.descriptionKey)}</Text>
              </Link>
            </Card>
          ))}
        </div>

        <Link
          href={guidePath()}
          variant="button" buttonVariant="pill" size="sm" className="mt-8"
        >
          {t('help.all')}
        </Link>
      </Container>

    </div>
  );
}
