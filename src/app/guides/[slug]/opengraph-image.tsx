import { renderGuideOgImage, ogImageSize } from '@/components/guides/guide-og-image';

export const runtime = 'nodejs';
export const size = ogImageSize;
export const contentType = 'image/png';
export const alt = 'Obelisk guide';

export default async function OgImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return renderGuideOgImage('en', slug);
}
