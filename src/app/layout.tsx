import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import { cookies } from 'next/headers';
import { LocaleProvider } from '@/i18n/context';
import type { Locale } from '@/i18n/index';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
});

const SITE_URL = process.env.CORS_ORIGIN || 'https://obelisk.ar';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Obelisk — Discord alternative with Nostr login. No email, no password.',
    template: '%s · Obelisk',
  },
  description:
    'The Discord alternative for crypto and privacy communities. Log in with your Nostr keys — no email, no password, no phone number. Servers, channels, voice and encrypted DMs, with Web of Trust spam resistance.',
  applicationName: 'Obelisk',
  keywords: [
    'Discord alternative',
    'Nostr login',
    'Nostr chat',
    'Nostr Discord',
    'no email no password chat',
    'private group chat',
    'crypto community chat',
    'decentralized Discord',
    'self-hosted chat',
    'sovereign identity chat',
    'NIP-07',
    'NIP-46 bunker',
    'Web of Trust',
    'open source Discord alternative',
    'La Crypta',
  ],
  authors: [{ name: 'La Crypta', url: 'https://lacrypta.ar' }],
  creator: 'La Crypta',
  publisher: 'La Crypta',
  category: 'social',
  referrer: 'origin-when-cross-origin',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: '/',
    languages: {
      en: '/',
      es: '/',
      'x-default': '/',
    },
  },
  icons: {
    icon: '/obelisk.png',
    apple: '/obelisk.png',
    shortcut: '/obelisk.png',
  },
  manifest: '/manifest.webmanifest',
  openGraph: {
    title: 'Obelisk — Discord alternative with Nostr login',
    description:
      'Group chat for crypto and privacy folks. Log in with your Nostr keys — no email, no password. Servers, voice, encrypted DMs, Web of Trust spam resistance.',
    siteName: 'Obelisk',
    url: SITE_URL,
    locale: 'en_US',
    alternateLocale: ['es_AR'],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Obelisk — Discord alternative with Nostr login',
    description:
      'Group chat for crypto and privacy folks. Log in with your Nostr keys — no email, no password.',
    creator: '@lacryptaar',
  },
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const locale = (cookieStore.get('locale')?.value as Locale) || 'es';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: SITE_URL,
        name: 'Obelisk',
        description:
          'Discord alternative with Nostr login — no email, no password. Group chat for crypto and privacy communities.',
        inLanguage: locale === 'en' ? 'en' : 'es-AR',
        publisher: { '@id': `${SITE_URL}/#organization` },
      },
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: 'La Crypta',
        url: 'https://lacrypta.ar',
        logo: `${SITE_URL}/obelisk.png`,
      },
      {
        '@type': 'SoftwareApplication',
        name: 'Obelisk',
        applicationCategory: 'CommunicationApplication',
        operatingSystem: 'Web',
        description:
          'Discord alternative powered by Nostr identity. Log in with your keys — no email, no password. Includes servers, channels, voice, encrypted DMs and Web of Trust spam resistance.',
        url: SITE_URL,
        image: `${SITE_URL}/obelisk.png`,
        author: { '@id': `${SITE_URL}/#organization` },
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
      },
    ],
  };

  return (
    <html lang={locale}>
      <head>
        <link rel="canonical" href={SITE_URL} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-BZ4NB66WY0"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-BZ4NB66WY0');
          `}
        </Script>
      </head>
      <body className={`${inter.className} bg-lc-black text-lc-white antialiased`}>
        <LocaleProvider initialLocale={locale}>
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
