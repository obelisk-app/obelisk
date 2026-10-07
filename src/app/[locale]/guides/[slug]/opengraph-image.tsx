import { ImageResponse } from 'next/og';
import { getTranslations } from 'next-intl/server';
import { isLocale } from '@/i18n';
import GuideOgCard from '@/components/guides/article/GuideOgCard';
import { readGuideOrNull } from '@/services/guides/guides';
import { guidePath } from '@/utils/guides/guide-urls';
import { localizedPath } from '@/utils/seo/alternates';
import { guideCardContent, guideCardText } from '@/utils/seo/card-layout';
import { OG_SIZE } from '@/constants/seo/og';

export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = 'image/png';
// Next's contract makes `alt` a static string; the localized alt text is
// in each article's `openGraph.images` metadata.
export const alt = 'Obelisk guide';

/** The guide's preview card, in the URL's language; a missing guide still gets a card. */
export default async function OgImage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale: raw, slug } = await params;
  const locale = isLocale(raw) ? raw : 'en';
  const t = await getTranslations({ locale });
  const content = guideCardContent(await readGuideOrNull(locale, slug));
  return new ImageResponse(
    GuideOgCard({
      label: t('seo.card.label.guide'),
      title: content.title,
      tags: content.tags,
      ...guideCardText(content.title, content.description),
      // The card's footer names the article's own section, in its language.
      footer: `obelisk.ar${localizedPath(locale, guidePath())}`,
    }),
    OG_SIZE,
  );
}
