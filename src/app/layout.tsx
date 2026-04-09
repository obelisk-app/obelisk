import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { cookies } from 'next/headers';
import { LocaleProvider } from '@/i18n/context';
import type { Locale } from '@/i18n/index';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'Obelisk — Chat with Nostr Identity',
  description: 'Discord-like chat app powered by Nostr identity. Built for La Crypta Identity Hackathon 2026.',
  icons: {
    icon: '/obelisk.png',
    apple: '/obelisk.png',
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const locale = (cookieStore.get('locale')?.value as Locale) || 'es';

  return (
    <html lang={locale}>
      <body className={`${inter.className} bg-lc-black text-lc-white antialiased`}>
        <LocaleProvider initialLocale={locale}>
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
