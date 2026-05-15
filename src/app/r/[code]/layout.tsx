import type { Metadata } from 'next';
import { decodeRelayShareCode } from '@/lib/relay-share-link';

type RelayBrand = {
  title: string;
  description: string;
};

const RELAY_BRANDING: Record<string, RelayBrand> = {
  'wss://lacrypta-relay.obelisk.ar': {
    title: 'La Crypta on Obelisk — Nostr group chat',
    description:
      'Join La Crypta on Obelisk. Group chat powered by Nostr identity — no email, no password.',
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const relayUrl = decodeRelayShareCode(code);
  const brand = relayUrl ? RELAY_BRANDING[relayUrl] : undefined;
  if (!brand) return {};

  return {
    title: brand.title,
    description: brand.description,
    openGraph: {
      title: brand.title,
      description: brand.description,
    },
    twitter: {
      card: 'summary_large_image',
      title: brand.title,
      description: brand.description,
    },
  };
}

export default function RelayShareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
