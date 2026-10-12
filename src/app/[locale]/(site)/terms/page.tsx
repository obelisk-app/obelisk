import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import LegalDocument from '@/components/legal/LegalDocument';
import { TERMS_DOCUMENT } from '@/constants/legal/terms';
import { standardPageMetadata } from '@/utils/seo/standard';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return standardPageMetadata(await getTranslations({ locale }), locale, 'terms');
}

/** `/terms`: the rules for the apps and the relays the project runs (App Store guideline 1.2). */
export default async function Page() {
  return <LegalDocument t={await getTranslations()} doc={TERMS_DOCUMENT} />;
}
