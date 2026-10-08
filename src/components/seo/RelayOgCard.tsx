import type { RelayCardProps } from '@/utils/seo/cards';

/**
 * A relay share link's 1200x630 preview card (`/r/<code>`): the relay's logo
 * when it has one, its name and line, and the tagline, on a dark grid. The
 * live-card route calls it as a function with what `relayCard` read and
 * hands the result to `ImageResponse`.
 */
export default function RelayOgCard({ title, subtitle, tagline, logo }: RelayCardProps) {
  return (
    <div
      style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', backgroundColor: '#0a0a0a',
        backgroundImage: 'radial-gradient(circle at 50% 35%, #1a2a10 0%, #0a0a0a 65%)',
        fontFamily: 'Inter, sans-serif', position: 'relative', overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute', inset: 0, display: 'flex', backgroundSize: '40px 40px',
          backgroundImage: 'linear-gradient(rgba(180,249,83,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(180,249,83,0.04) 1px, transparent 1px)',
        }}
      />
      {/* The image renderer (satori) draws a plain <img>; next/image cannot render there. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {logo ? <img src={logo} alt={title} width={320} height={320} style={{ borderRadius: 32 }} /> : null}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 32 }}>
        <span style={{ fontSize: 72, fontWeight: 800, color: '#fafafa', letterSpacing: '-0.02em' }}>{title}</span>
        <span style={{ fontSize: 28, color: '#a3a3a3', marginTop: 4 }}>{subtitle}</span>
      </div>
      <div style={{ position: 'absolute', bottom: 36, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 20, color: '#b4f953', fontWeight: 600 }}>{tagline}</span>
      </div>
    </div>
  );
}
