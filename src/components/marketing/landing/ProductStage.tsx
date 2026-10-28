import { useTranslations } from 'next-intl';
import Container from '@/components/ui/layout/Container';
import { HERO_CLIPS } from '@/constants/marketing/landing';
import HeroClip from './HeroClip';

/**
 * The desktop app, big enough to read: the clip in a browser window as wide as
 * the page, straight under the hero. Where the browser has scroll-driven
 * animations it starts tilted back and settles flat as it scrolls into view
 * (`.lc-stage-tilt` in globals.css); elsewhere, and under reduced motion, it
 * just sits flat. Below `md` the hero's phone already shows the app, so this
 * is hidden.
 */
export default function ProductStage() {
  const t = useTranslations();
  return (
    <section data-testid="landing-stage" className="relative hidden md:block px-6 pb-16 [perspective:1600px]">
      <Container width="5xl" aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/4 h-2/3 rounded-full bg-lc-green/10 blur-[140px]" />
      <Container width="6xl" className="relative">
        <figure className="lc-stage-tilt overflow-hidden rounded-2xl border border-lc-border bg-lc-dark shadow-[0_40px_120px_-20px_rgba(0,0,0,0.8),0_0_0_1px_rgba(180,249,83,0.08)]">
          <div className="flex items-center gap-2 border-b border-lc-border bg-lc-black/70 px-4 py-2.5" aria-hidden="true">
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]/80" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e]/80" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]/80" />
            <span className="mx-auto truncate rounded-md bg-white/5 px-16 py-1 text-xs text-lc-muted">obelisk.ar/app</span>
          </div>
          <HeroClip {...HERO_CLIPS.desktop} alt={t('marketing.landing.preview.desktop.alt')} sizes="(max-width: 1200px) 95vw, 1152px" />
        </figure>
      </Container>
    </section>
  );
}
