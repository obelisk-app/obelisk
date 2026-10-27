import { HERO_CLIPS } from '@/constants/marketing/landing';
import HeroClip from './HeroClip';

type HeroProductPreviewProps = {
  mobileAlt: string;
};

/**
 * The hero's right column: the phone app looping in a phone frame big enough
 * to read, on its own. The phone is sized off the viewport height so it never
 * pushes the hero past the fold.
 * The desktop clip has its own full-width stage below (`ProductStage`).
 */
export default function HeroProductPreview({ mobileAlt }: HeroProductPreviewProps) {
  return (
    <div data-testid="hero-product-preview" className="relative isolate mx-auto flex w-full min-w-0 items-center justify-center py-8 lg:py-0">
      <figure className="relative w-[230px] sm:w-[250px] lg:w-[min(280px,calc((100svh-13rem)*0.45))] overflow-hidden rounded-[2.4rem] border-[7px] border-lc-dark bg-lc-black shadow-2xl shadow-black/70 ring-1 ring-lc-green/25 animate-lc-float">
        <span aria-hidden="true" className="absolute left-1/2 top-2 z-10 h-1.5 w-16 -translate-x-1/2 rounded-full bg-lc-black/90" />
        <HeroClip {...HERO_CLIPS.mobile} alt={mobileAlt} priority sizes="280px" />
      </figure>
    </div>
  );
}
