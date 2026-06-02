import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { decodeRelayShareCode } from '@/lib/relay-share-link';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Relay on Obelisk';

type RelayOg = {
  title: string;
  subtitle: string;
  logoFile: string;
};

const RELAY_OG: Record<string, RelayOg> = {
  'wss://lacrypta-relay.obelisk.ar': {
    title: 'La Crypta',
    subtitle: 'on Obelisk — Nostr group chat',
    logoFile: 'lacrypta-logo.png',
  },
};

export default async function OgImage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const relayUrl = decodeRelayShareCode(code);
  const brand = relayUrl ? RELAY_OG[relayUrl] : undefined;

  let logoDataUri: string | null = null;
  if (brand) {
    try {
      const buf = await readFile(
        path.join(process.cwd(), 'public', brand.logoFile),
      );
      logoDataUri = `data:image/png;base64,${buf.toString('base64')}`;
    } catch {
      // fall through — render text-only card
    }
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0a0a0a',
          backgroundImage:
            'radial-gradient(circle at 50% 35%, #1a2a10 0%, #0a0a0a 65%)',
          fontFamily: 'Inter, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            backgroundImage:
              'linear-gradient(rgba(180,249,83,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(180,249,83,0.04) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        {logoDataUri ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoDataUri}
            alt={brand?.title ?? ''}
            width={320}
            height={320}
            style={{ borderRadius: 32 }}
          />
        ) : null}

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginTop: 32,
          }}
        >
          <span
            style={{
              fontSize: 72,
              fontWeight: 800,
              color: '#fafafa',
              letterSpacing: '-0.02em',
            }}
          >
            {brand?.title ?? 'Obelisk relay'}
          </span>
          <span style={{ fontSize: 28, color: '#a3a3a3', marginTop: 4 }}>
            {brand?.subtitle ?? 'Nostr group chat'}
          </span>
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: 36,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 20, color: '#b4f953', fontWeight: 600 }}>
            No emails. No passwords. Cryptographic identity.
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
