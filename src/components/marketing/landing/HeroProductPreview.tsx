import { HERO_CLIPS } from '@/constants/marketing/landing';
import ObeliskIcon from '@/assets/brand/ObeliskIcon';
import HeroClip from './HeroClip';

type HeroProductPreviewProps = {
  mobileAlt: string;
};

/**
 * The hero's right column, Obelisk Sky's porthole in Obelisk's lime: the phone
 * app looping in a phone frame big enough to read, inside a glowing ring with
 * a slow dashed orbit, and the obelisk mark floating at its foot. The phone is
 * sized off the viewport height so it never pushes the hero past the fold.
 * The desktop clip has its own full-width stage below (`ProductStage`).
 */
export default function HeroProductPreview({ mobileAlt }: HeroProductPreviewProps) {
  return (
    <div data-testid="hero-product-preview" className="relative isolate mx-auto flex w-full min-w-0 items-center justify-center py-8 lg:py-0">
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 -z-10 -translate-x-1/2 -translate-y-1/2">
        <div className="size-[340px] sm:size-[420px] lg:size-[500px] rounded-full border border-lc-green/15 bg-[radial-gradient(circle,rgba(180,249,83,0.16)_0%,rgba(180,249,83,0.05)_45%,transparent_70%)] shadow-[0_0_120px_rgba(180,249,83,0.12)]" />
        <div className="absolute inset-6 lg:inset-8 rounded-full border border-dashed border-lc-green/20 animate-spin-slow" />
      </div>

      <figure className="relative w-[230px] sm:w-[250px] lg:w-[min(280px,calc((100svh-13rem)*0.45))] overflow-hidden rounded-[2.4rem] border-[7px] border-lc-dark bg-lc-black shadow-2xl shadow-black/70 ring-1 ring-lc-green/25 animate-lc-float">
        <span aria-hidden="true" className="absolute left-1/2 top-2 z-10 h-1.5 w-16 -translate-x-1/2 rounded-full bg-lc-black/90" />
        <HeroClip {...HERO_CLIPS.mobile} alt={mobileAlt} priority sizes="280px" />
      </figure>

      <div aria-hidden="true" className="absolute bottom-4 left-[calc(50%-200px)] hidden sm:block lg:bottom-10 lg:left-[calc(50%-230px)] animate-lc-float [animation-delay:-3.5s]">
        <ObeliskIcon className="h-24 w-24 text-lc-green drop-shadow-[0_0_24px_rgba(180,249,83,0.45)]" />
      </div>
    </div>
  );
}
