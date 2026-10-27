import { HERO_CLIPS } from '@/constants/marketing/landing';
import HeroClip from './HeroClip';

type HeroProductPreviewProps = {
  desktopAlt: string;
  mobileAlt: string;
};

/**
 * The hero's right column: the desktop app looping in a browser window and
 * the phone app looping in a phone frame that overlaps its corner. Below `md`
 * only the phone shows. Both frames bob slowly, as Obelisk Sky's porthole does.
 */
export default function HeroProductPreview({ desktopAlt, mobileAlt }: HeroProductPreviewProps) {
  return (
    <div data-testid="hero-product-preview" className="relative mx-auto w-full max-w-[640px] min-w-0 md:pb-12 lg:pb-14">
      <div
        aria-hidden="true"
        className="absolute inset-x-6 inset-y-10 -z-10 rounded-[2rem] bg-lc-green/[0.08] blur-[80px] pointer-events-none"
      />

      <figure className="hidden md:block mr-16 lg:mr-20 overflow-hidden rounded-xl border border-lc-border bg-lc-dark/90 shadow-2xl shadow-black/50 animate-lc-float">
        <div className="flex items-center gap-1.5 border-b border-lc-border bg-lc-black/60 px-3 py-2" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="ml-3 truncate rounded-full bg-white/5 px-3 py-0.5 text-[11px] text-lc-muted">obelisk.ar/app</span>
        </div>
        <HeroClip {...HERO_CLIPS.desktop} alt={desktopAlt} priority sizes="(max-width: 1024px) 80vw, 560px" />
      </figure>

      <figure className="relative mx-auto w-[200px] sm:w-[220px] md:absolute md:right-0 md:bottom-0 md:w-[150px] lg:w-[170px] overflow-hidden rounded-[2rem] border-[6px] border-lc-dark bg-lc-black shadow-2xl shadow-black/70 ring-1 ring-lc-border animate-lc-float [animation-delay:-3.5s]">
        <span aria-hidden="true" className="absolute left-1/2 top-1.5 z-10 h-1.5 w-14 -translate-x-1/2 rounded-full bg-lc-black/90" />
        <HeroClip {...HERO_CLIPS.mobile} alt={mobileAlt} priority sizes="220px" />
      </figure>
    </div>
  );
}
