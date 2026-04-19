import { ImageResponse } from 'next/og';
import { readGuide } from '@/lib/guides';
import type { Locale } from '@/i18n';

export const ogImageSize = { width: 1200, height: 630 };

export async function renderGuideOgImage(locale: Locale, slug: string) {
  let title = 'Obelisk';
  let description = '';
  let tags: string[] = [];
  try {
    const guide = await readGuide(locale, slug);
    title = guide.frontmatter.title;
    description = guide.frontmatter.description;
    tags = guide.frontmatter.tags || [];
  } catch {
    // fall through with defaults
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background:
            'linear-gradient(135deg, #0a0a0a 0%, #171717 45%, #1e2812 100%)',
          color: '#fafafa',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 48,
              height: 48,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="48" height="48" viewBox="0 0 48 48">
              <polygon points="24,4 30,40 18,40" fill="#b4f953" />
              <rect x="16" y="40" width="16" height="3" fill="#8bc34a" />
            </svg>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.5 }}>
            Obelisk
          </div>
          <div style={{ flex: 1 }} />
          <div
            style={{
              fontSize: 18,
              color: '#b4f953',
              textTransform: 'uppercase',
              letterSpacing: 1.5,
              fontWeight: 700,
            }}
          >
            {locale === 'en' ? 'Guide' : 'Guía'}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
            flex: 1,
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              fontSize: 68,
              fontWeight: 800,
              letterSpacing: -1.5,
              lineHeight: 1.05,
              color: '#fafafa',
            }}
          >
            {title}
          </div>
          {description && (
            <div
              style={{
                fontSize: 28,
                fontWeight: 400,
                lineHeight: 1.35,
                color: '#a3a3a3',
                maxWidth: 1020,
              }}
            >
              {description.length > 160 ? description.slice(0, 157) + '…' : description}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {tags.slice(0, 4).map((tag) => (
            <div
              key={tag}
              style={{
                padding: '8px 18px',
                borderRadius: 999,
                background: '#2d3a1a',
                color: '#b4f953',
                fontSize: 20,
                fontWeight: 600,
                fontFamily: 'monospace',
              }}
            >
              #{tag}
            </div>
          ))}
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 20, color: '#a3a3a3' }}>obelisk.ar/guides</div>
        </div>
      </div>
    ),
    ogImageSize,
  );
}
