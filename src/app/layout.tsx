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
  metadataBase: new URL(process.env.CORS_ORIGIN || 'https://obelisk.ar'),
  title: 'Obelisk — Chat grupal con identidad Nostr',
  description:
    'App de chat grupal estilo Discord impulsada por identidad Nostr. Sin emails, sin contraseñas — identidad criptográfica. Creada para el Hackathon IDENTITY de La Crypta 2026.',
  icons: {
    icon: '/obelisk.png',
    apple: '/obelisk.png',
  },
  openGraph: {
    title: 'Obelisk — Chat grupal con identidad Nostr',
    description:
      'Chat grupal estilo Discord con identidad criptográfica Nostr. Sin emails, sin contraseñas.',
    siteName: 'Obelisk',
    locale: 'es_AR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Obelisk — Chat grupal con identidad Nostr',
    description:
      'Chat grupal estilo Discord con identidad criptográfica Nostr. Sin emails, sin contraseñas.',
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
