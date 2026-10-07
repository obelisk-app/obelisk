import type { GuideCardText } from '@/utils/seo/card-layout';
import ObeliskOgMark from '@/assets/brand/ObeliskOgMark';

/**
 * A guide's 1200x630 preview card: the obelisk mark and wordmark, the
 * "guide" label, the title and description at the sizes `guideCardText`
 * picked for them, up to four tags and the guides section's address. The
 * route (`src/app/[locale]/guides/[slug]/opengraph-image.tsx`) calls it as a
 * function and hands the result to `ImageResponse`.
 */
export default function GuideOgCard({
  label,
  title,
  description,
  titleFontSize,
  descFontSize,
  tags,
  footer,
}: GuideCardText & { label: string; title: string; tags: string[]; footer: string }) {
  return (
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
          <ObeliskOgMark />
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
          {label}
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
            fontSize: titleFontSize,
            fontWeight: 800,
            letterSpacing: -1.5,
            lineHeight: 1.05,
            color: '#fafafa',
            maxWidth: 1056,
          }}
        >
          {title}
        </div>
        {description && (
          <div
            style={{
              fontSize: descFontSize,
              fontWeight: 400,
              lineHeight: 1.35,
              color: '#a3a3a3',
              maxWidth: 1056,
            }}
          >
            {description}
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
            {`#${tag}`}
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 20, color: '#a3a3a3' }}>{footer}</div>
      </div>
    </div>
  );
}
