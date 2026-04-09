import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const alt = 'Obelisk — Chat grupal con identidad Nostr';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OGImage() {
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
            'radial-gradient(circle at 50% 30%, #1a2a10 0%, #0a0a0a 60%)',
          fontFamily: 'Inter, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Grid pattern */}
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

        {/* Sun glow behind obelisk */}
        <div
          style={{
            position: 'absolute',
            top: '80px',
            display: 'flex',
            width: '340px',
            height: '340px',
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(180,249,83,0.35) 0%, rgba(180,249,83,0.1) 40%, transparent 70%)',
          }}
        />

        {/* Sun circle */}
        <div
          style={{
            position: 'absolute',
            top: '140px',
            display: 'flex',
            width: '130px',
            height: '130px',
            borderRadius: '50%',
            backgroundColor: '#b4f953',
            boxShadow: '0 0 60px rgba(180,249,83,0.5)',
          }}
        />

        {/* Obelisk SVG */}
        <svg
          viewBox="0 0 512 512"
          width="280"
          height="280"
          style={{ marginTop: -30, position: 'relative' }}
        >
          <path
            d="M 256,16 L 220,72 L 196,460 L 200,464 L 256,464 L 256,72 Z"
            fill="#a3a3a3"
            opacity={0.7}
          />
          <path
            d="M 256,16 L 292,72 L 316,460 L 312,464 L 256,464 L 256,72 Z"
            fill="#fafafa"
          />
        </svg>

        {/* Title */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginTop: 8,
            position: 'relative',
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
            Obelisk
          </span>
          <span
            style={{
              fontSize: 28,
              color: '#a3a3a3',
              marginTop: 4,
            }}
          >
            Chat grupal con identidad Nostr
          </span>
        </div>

        {/* Bottom badge */}
        <div
          style={{
            position: 'absolute',
            bottom: 36,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 20,
              color: '#b4f953',
              fontWeight: 600,
            }}
          >
            Sin emails. Sin contraseñas. Identidad criptográfica.
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
