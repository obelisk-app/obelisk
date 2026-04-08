import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-lc-black text-lc-white antialiased`}>
        {children}
      </body>
    </html>
  );
}
