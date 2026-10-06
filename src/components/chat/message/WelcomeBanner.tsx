'use client';

import ShootingStars from '@/components/marketing/ShootingStars';

/**
 * Welcome banner wrapper: the welcome bot posts a markdown image pointing
 * at /api/welcome-banner. We detect that URL and render the image inside a
 * container with the same canvas-based shooting-stars effect the landing
 * page uses. The canvas sits BEHIND the <img> so the streaks only show
 * through the banner's transparent background; they never overlap the
 * avatar, text, or glow, which are baked into the PNG.
 */
export function WelcomeBanner({ src, alt }: { src: string; alt: string }) {
  return (
    <span
      className="relative block mt-1 max-w-sm rounded-2xl overflow-hidden bg-lc-dark"
      data-testid="welcome-banner"
    >
      {/* Canvas shooting stars sit at the bottom of the stacking order,
          behind the <img>. The banner PNG has a transparent background, so
          stars show through empty areas but are hidden behind any baked-in
          pixel (avatar, text, glow). */}
      <ShootingStars contained count={4} />
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="relative z-[1] block w-full"
        data-testid="welcome-banner-img"
      />
    </span>
  );
}
