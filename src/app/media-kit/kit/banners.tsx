import { COPY, GLOW_GRADIENT, GRID_OVERLAY } from './content';
import { ObeliskMark } from './kit-ui';

/** Where each layer of a centered composition sits, as % of the banner. */
type CenteredLayout = {
  aspect: string;
  background: string;
  glow: { width: string; top: string };
  orb: { width: string; top: string };
  mark: { width: string; top: string };
  titleTop: string;
  oneLinerBottom: string;
  titleClass: string;
  taglineClass: string;
};

// The "obelisk piercing a green orb" composition, centered, with the name,
// tagline and one-liner beneath. The OG image, the GitHub preview and the
// square avatar are this one picture at different aspect ratios.
function CenteredBanner({ layout: l }: { layout: CenteredLayout }) {
  return (
    <div
      className="relative w-full overflow-hidden"
      style={{
        aspectRatio: l.aspect,
        background: l.background,
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={GRID_OVERLAY}
      />
      {/* Glow halo */}
      <div
        className="absolute rounded-full"
        style={{
          width: l.glow.width,
          aspectRatio: '1',
          top: l.glow.top,
          left: '50%',
          transform: 'translateX(-50%)',
          background: GLOW_GRADIENT,
        }}
      />
      {/* Green orb */}
      <div
        className="absolute rounded-full"
        style={{
          width: l.orb.width,
          aspectRatio: '1',
          top: l.orb.top,
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: '#b4f953',
          boxShadow: '0 0 60px rgba(180,249,83,0.5)',
        }}
      />
      {/* Obelisk piercing the orb (apex sits inside the orb) */}
      <div
        className="absolute"
        style={{
          width: l.mark.width,
          aspectRatio: '1',
          top: l.mark.top,
          left: '50%',
          transform: 'translateX(-50%)',
        }}
      >
        <ObeliskMark />
      </div>
      {/* Title */}
      <div
        className="absolute flex flex-col items-center w-full"
        style={{ top: l.titleTop }}
      >
        <span className={`${l.titleClass} font-extrabold tracking-tight`}>
          {COPY.name}
        </span>
        <span className={`mt-1 text-lc-muted ${l.taglineClass}`}>
          {COPY.tagline}
        </span>
      </div>
      <p
        className="absolute text-center text-lc-green font-semibold text-[10px] sm:text-xs md:text-sm w-full"
        style={{ bottom: l.oneLinerBottom }}
      >
        {COPY.oneLiner}
      </p>
    </div>
  );
}

export function HeroBanner() {
  return (
    <CenteredBanner
      layout={{
        aspect: '1200 / 630',
        background: 'radial-gradient(circle at 50% 30%, #1a2a10 0%, #0a0a0a 60%)',
        glow: { width: '28%', top: '12.7%' },
        orb: { width: '10.8%', top: '22.2%' },
        mark: { width: '23.3%', top: '23%' },
        titleTop: '69%',
        oneLinerBottom: '5.7%',
        titleClass: 'text-3xl sm:text-5xl md:text-6xl lg:text-7xl',
        taglineClass: 'text-xs sm:text-sm md:text-base lg:text-lg',
      }}
    />
  );
}

// GitHub social preview is 1280 × 640, basically the OG composition with
// slightly different aspect, so we reuse the hero composition.
export function GitHubSocialBanner() {
  return (
    <CenteredBanner
      layout={{
        aspect: '1280 / 640',
        background: 'radial-gradient(circle at 50% 30%, #1a2a10 0%, #0a0a0a 60%)',
        glow: { width: '28%', top: '10%' },
        orb: { width: '10.5%', top: '20%' },
        mark: { width: '22%', top: '21%' },
        titleTop: '67%',
        oneLinerBottom: '6%',
        titleClass: 'text-3xl sm:text-5xl md:text-6xl lg:text-7xl',
        taglineClass: 'text-xs sm:text-sm md:text-base lg:text-lg',
      }}
    />
  );
}

// Square 1080×1080 for Instagram / Mastodon avatars or post thumbnails.
export function SquareBanner() {
  return (
    <CenteredBanner
      layout={{
        aspect: '1 / 1',
        background: 'radial-gradient(circle at 50% 35%, #1a2a10 0%, #0a0a0a 60%)',
        glow: { width: '54%', top: '12%' },
        orb: { width: '20%', top: '22%' },
        mark: { width: '42%', top: '23%' },
        titleTop: '70%',
        oneLinerBottom: '6%',
        titleClass: 'text-3xl sm:text-5xl md:text-6xl',
        taglineClass: 'text-xs sm:text-sm md:text-base',
      }}
    />
  );
}

// Reusable horizontal "obelisk inside green orb" composition for short-height
// banners: column on the left, text on the right.
function HorizontalBanner({
  aspect,
  columnLeft,
  columnWidth,
  textLeft,
  bgGradient,
  titleClass,
  taglineClass,
  oneLinerClass,
  showOneLiner = true,
}: {
  aspect: string;
  columnLeft: string;
  columnWidth: string;
  textLeft: string;
  bgGradient: string;
  titleClass: string;
  taglineClass: string;
  oneLinerClass: string;
  showOneLiner?: boolean;
}) {
  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ aspectRatio: aspect, background: bgGradient }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={GRID_OVERLAY}
      />
      {/* Composition column */}
      <div
        className="absolute"
        style={{
          left: columnLeft,
          top: 0,
          height: '100%',
          width: columnWidth,
        }}
      >
        {/* Glow */}
        <div
          className="absolute rounded-full"
          style={{
            height: '120%',
            aspectRatio: '1',
            top: '-10%',
            left: '50%',
            transform: 'translateX(-50%)',
            background: GLOW_GRADIENT,
          }}
        />
        {/* Orb */}
        <div
          className="absolute rounded-full"
          style={{
            height: '36%',
            aspectRatio: '1',
            top: '20%',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#b4f953',
            boxShadow: '0 0 50px rgba(180,249,83,0.5)',
          }}
        />
        {/* Obelisk piercing the orb */}
        <div
          className="absolute"
          style={{
            height: '84%',
            aspectRatio: '1',
            top: '8%',
            left: '50%',
            transform: 'translateX(-50%)',
          }}
        >
          <ObeliskMark />
        </div>
      </div>
      {/* Text */}
      <div
        className="absolute"
        style={{ left: textLeft, top: '50%', transform: 'translateY(-50%)' }}
      >
        <div className={`font-extrabold tracking-tight ${titleClass}`}>
          {COPY.name}
        </div>
        <div className={`mt-1 text-lc-muted ${taglineClass}`}>
          {COPY.tagline}
        </div>
        {showOneLiner && (
          <div
            className={`mt-3 text-lc-green font-semibold ${oneLinerClass}`}
          >
            {COPY.oneLiner}
          </div>
        )}
      </div>
    </div>
  );
}

export function XHeaderBanner() {
  return (
    <HorizontalBanner
      aspect="1500 / 500"
      columnLeft="6%"
      columnWidth="22%"
      textLeft="34%"
      bgGradient="radial-gradient(ellipse at 18% 50%, #1a2a10 0%, #0a0a0a 60%)"
      titleClass="text-3xl sm:text-5xl md:text-6xl lg:text-7xl"
      taglineClass="text-xs sm:text-base md:text-xl lg:text-2xl"
      oneLinerClass="text-[10px] sm:text-xs md:text-sm lg:text-base"
    />
  );
}

export function LinkedInBanner() {
  return (
    <HorizontalBanner
      aspect="1584 / 396"
      columnLeft="6%"
      columnWidth="18%"
      textLeft="29%"
      bgGradient="radial-gradient(ellipse at 16% 50%, #1a2a10 0%, #0a0a0a 60%)"
      titleClass="text-2xl sm:text-4xl md:text-5xl lg:text-6xl"
      taglineClass="text-[10px] sm:text-sm md:text-lg lg:text-xl"
      oneLinerClass="text-[9px] sm:text-xs md:text-sm"
      showOneLiner={false}
    />
  );
}
