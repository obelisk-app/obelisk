import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { standardNoindexMetadata } from '@/utils/seo/standard';
import VoiceRoomForm from './VoiceRoomForm';

/**
 * A room-name form for testing calls: it needs a signed-in key, nothing a
 * search result should lead to (`noindex, follow`).
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return standardNoindexMetadata(await getTranslations({ locale }), locale, 'voice');
}

export default async function Page() {
  return <VoiceRoomForm />;
}
