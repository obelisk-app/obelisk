import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Launch the chat — Nostr login, no email, no password',
  description:
    'Open Obelisk and sign in with your Nostr keys via browser extension, nsec, or NIP-46 bunker. Discord-style servers, channels, voice and encrypted DMs — no email, no password.',
  alternates: { canonical: '/chat' },
  openGraph: {
    title: 'Launch Obelisk — Nostr-native group chat',
    description:
      'Sign in with your Nostr keys and join sovereign servers. Text, voice, threads and encrypted DMs.',
    url: '/chat',
    type: 'website',
  },
  robots: { index: true, follow: true },
};

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return children;
}
