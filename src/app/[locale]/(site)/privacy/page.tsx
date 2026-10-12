import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import LegalDocument from '@/components/legal/LegalDocument';
import { PRIVACY_DOCUMENT } from '@/constants/legal/privacy';
import { standardPageMetadata } from '@/utils/seo/standard';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return standardPageMetadata(await getTranslations({ locale }), locale, 'privacy');
}

/** `/privacy`: what the apps send, to whom, and what they keep on the device. */
export default async function Page() {
  return <LegalDocument t={await getTranslations()} doc={PRIVACY_DOCUMENT} />;
}
