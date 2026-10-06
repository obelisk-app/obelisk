import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { pageLocale, type LocaleParams } from '@/i18n/page-locale';
import { standardNoindexMetadata } from '@/utils/seo/standard';
import VoiceRoomForm from './VoiceRoomForm';

/**
 * A room-name form for testing calls: it needs a signed-in key, nothing a
 * search result should lead to (`noindex, follow`).
 */
export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  return standardNoindexMetadata(await getTranslations({ locale }), locale, 'voice', '/voice');
}

export default async function Page({ params }: LocaleParams) {
  await pageLocale(params);
  return <VoiceRoomForm />;
}
