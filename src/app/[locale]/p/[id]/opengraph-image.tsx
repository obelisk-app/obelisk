import { ogCardResponse } from '@/components/seo/OgCard';
import { profileCard } from '@/services/server/og/og-cards';
import { OG_SIZE } from '@/utils/seo/og';

export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = 'image/png';
// Static by Next's contract; the page's metadata names this card with a translated alt.
export const alt = 'Obelisk';

/** The card a chat app shows for this link, in the URL's language. */
export default async function Image({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  return ogCardResponse(await profileCard(locale, id));
}
