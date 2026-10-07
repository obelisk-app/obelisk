import { ImageResponse } from 'next/og';
import OgCard from '@/components/seo/OgCard';
import { pageCard } from '@/services/server/og/og-cards';
import { OG_SIZE } from '@/utils/seo/og';

export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = 'image/png';
// Static by Next's contract; the page's metadata names this card with a translated alt.
export const alt = 'Obelisk';

/** This page's own preview card, in the URL's language. */
export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  return new ImageResponse(OgCard(await pageCard((await params).locale, 'mobile')), OG_SIZE);
}
