import { ImageResponse } from 'next/og';
import { OG_SIZE } from '@/utils/seo/og';
import type { OgCardProps } from '@/utils/seo/cards';
import OgIcon from './OgIcon';

/**
 * A page's 1200x630 preview card, in the look of the guide cards
 * (`src/components/guides/article/guide-og-image.tsx`): the dark-to-olive gradient,
 * the green obelisk mark and wordmark, a green label, the page's title and
 * description, its address in the footer, and the page's own illustration.
 */
function titleSize(title: string): number {
  if (title.length <= 32) return 66;
  if (title.length <= 52) return 56;
  if (title.length <= 80) return 48;
  return 40;
}

export default function OgCard({ label, title, subtitle, footer, icon }: OgCardProps) {
  return (
    <div
      style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        padding: 64, background: 'linear-gradient(135deg, #0a0a0a 0%, #171717 45%, #1e2812 100%)',
        color: '#fafafa', fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <svg width="48" height="48" viewBox="0 0 48 48">
          <polygon points="24,4 30,40 18,40" fill="#b4f953" />
          <rect x="16" y="40" width="16" height="3" fill="#8bc34a" />
        </svg>
        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.5 }}>Obelisk</div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 20, color: '#b4f953', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 700 }}>
          {label}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 48, flex: 1 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22, flex: 1 }}>
          <div style={{ fontSize: titleSize(title), fontWeight: 800, letterSpacing: -1.2, lineHeight: 1.08 }}>{title}</div>
          <div style={{ fontSize: 26, lineHeight: 1.38, color: '#a3a3a3' }}>{subtitle}</div>
        </div>
        <div
          style={{
            width: 260, height: 260, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 36, border: '2px solid #2d3a1a', background: 'rgba(180,249,83,0.06)',
          }}
        >
          {OgIcon({ name: icon })}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ height: 4, width: 96, borderRadius: 2, background: '#b4f953' }} />
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 22, color: '#a3a3a3' }}>{footer}</div>
      </div>
    </div>
  );
}

/** The card as the PNG an `opengraph-image.tsx` route returns. */
export function ogCardResponse(props: OgCardProps): ImageResponse {
  return new ImageResponse(OgCard(props), OG_SIZE);
}
