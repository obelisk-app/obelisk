import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import LegalDocument from '@/components/legal/LegalDocument';
import { SUPPORT_DOCUMENT } from '@/constants/legal/support';
import { standardPageMetadata } from '@/utils/seo/standard';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return standardPageMetadata(await getTranslations({ locale }), locale, 'support');
}

/** `/support`: contact, abuse reports and the common questions; the iOS app's Support URL. */
export default async function Page() {
  return <LegalDocument t={await getTranslations()} doc={SUPPORT_DOCUMENT} />;
}
