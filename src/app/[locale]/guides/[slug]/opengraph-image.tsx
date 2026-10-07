import { isLocale } from '@/i18n';
import { renderGuideOgImage, ogImageSize } from '@/components/guides/article/guide-og-image';

export const runtime = 'nodejs';
export const size = ogImageSize;
export const contentType = 'image/png';
// Next's contract makes `alt` a static string; the localized alt text is
// in each article's `openGraph.images` metadata.
export const alt = 'Obelisk guide';

export default async function OgImage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  return renderGuideOgImage(isLocale(locale) ? locale : 'en', slug);
}
