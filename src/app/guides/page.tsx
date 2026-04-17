import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Locale } from '@/i18n';

export const dynamic = 'force-dynamic';

export default async function GuidesRedirect() {
  const store = await cookies();
  const cookieLocale = store.get('locale')?.value;
  const locale: Locale = cookieLocale === 'en' ? 'en' : 'es';
  redirect(`/guides/${locale}`);
}
