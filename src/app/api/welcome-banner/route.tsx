import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

const SIZE = { width: 600, height: 340 };

/**
 * GET /api/welcome-banner?picture=<url>&name=<name>
 * Generates a dynamic welcome card image.
 * Without params, generates a generic welcome banner.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const picture = searchParams.get('picture');
  const name = searchParams.get('name');

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
          // Transparent background so the animated shooting-stars canvas
          // drawn behind the <img> can show through the empty parts of the
          // banner. The wrapper <span> in WelcomeBanner provides the dark
          // card color. Border stays on the PNG so the card still looks
          // right when fetched standalone.
          backgroundColor: 'transparent',
          borderRadius: '16px',
          border: '1px solid #262626',
          fontFamily: 'Inter, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >

        {/* Green glow behind avatar */}
        <div
          style={{
            position: 'absolute',
            top: '20px',
            display: 'flex',
            width: '200px',
            height: '200px',
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(180,249,83,0.15) 0%, transparent 70%)',
          }}
        />

        {/* Avatar or Obelisk icon */}
        {picture ? (
          // Satori (next/og) does not clip child images with overflow:hidden,
          // so the border-radius must live on the <img> itself — otherwise the
          // square picture renders with a circle ring drawn on top.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={picture}
            alt=""
            width={120}
            height={120}
            style={{
              width: '120px',
              height: '120px',
              borderRadius: '50%',
              objectFit: 'cover',
              border: '3px solid #b4f953',
              boxShadow: '0 0 30px rgba(180,249,83,0.3)',
            }}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '120px',
              height: '120px',
              borderRadius: '50%',
              backgroundColor: '#262626',
              border: '3px solid #b4f953',
              boxShadow: '0 0 30px rgba(180,249,83,0.3)',
              position: 'relative',
            }}
          >
            {/* Obelisk SVG */}
            <svg viewBox="0 0 512 512" width="70" height="70">
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
          </div>
        )}

        {/* Welcome text */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginTop: 20,
            position: 'relative',
          }}
        >
          <span
            style={{
              fontSize: 36,
              fontWeight: 700,
              color: '#fafafa',
              letterSpacing: '-0.01em',
            }}
          >
            {name
              ? `Bienvenid@ ${name}`
              : 'Bienvenido/a a La Crypta'}
          </span>
          {!name && (
            <span
              style={{
                fontSize: 18,
                color: '#a3a3a3',
                marginTop: 8,
              }}
            >
              Identidad criptografica. Comunidad real.
            </span>
          )}
        </div>

        {/* Bottom accent line */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '3px',
            display: 'flex',
            background: 'linear-gradient(90deg, transparent, #b4f953, transparent)',
          }}
        />
      </div>
    ),
    { ...SIZE },
  );
}
