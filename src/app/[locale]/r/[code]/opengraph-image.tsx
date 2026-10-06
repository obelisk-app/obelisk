import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { decodeRelayShareCode } from '@/utils/relay-url/relay-share-link';
import { getTranslations } from 'next-intl/server';
import { isLocale } from '@/i18n';
import type { MessageKey } from '@/i18n/keys';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
// Static by Next's contract; the localized alt is `seo.relay.ogAlt`.
export const alt = 'Relay on Obelisk';

type RelayOg = {
  /** The relay's own name: a brand, the same in every language. */
  title: string;
  subtitleKey: MessageKey;
  logoFile: string;
};

const RELAY_OG: Record<string, RelayOg> = {
  'wss://lacrypta-relay.obelisk.ar': {
    title: 'La Crypta',
    subtitleKey: 'seo.relay.laCrypta.ogSubtitle',
    logoFile: 'lacrypta-logo.png',
  },
};

export default async function OgImage({
  params,
}: {
  params: Promise<{ code: string; locale: string }>;
}) {
  const { code, locale } = await params;
  const t = await getTranslations({ locale: isLocale(locale) ? locale : 'en' });
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
      // fall through - render text-only card
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
            {brand?.title ?? t('seo.relay.fallbackTitle')}
          </span>
          <span style={{ fontSize: 28, color: '#a3a3a3', marginTop: 4 }}>
            {brand ? t(brand.subtitleKey) : t('seo.relay.fallbackSubtitle')}
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
            {t('seo.relay.ogTagline')}
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
