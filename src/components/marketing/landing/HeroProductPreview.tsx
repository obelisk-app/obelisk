'use client';

import Container from '@/components/ui/layout/Container';
import Image from 'next/image';
import { useTranslations } from 'next-intl';

type HeroProductPreviewProps = {
  desktopAlt: string;
  mobileAlt: string;
};

/** The desktop and phone screenshots under the hero, with the live badges. */
export default function HeroProductPreview({ desktopAlt, mobileAlt }: HeroProductPreviewProps) {
  const t = useTranslations();
  return (
    <Container width="5xl"
      data-testid="hero-product-preview"
      className="relative mt-8 w-full md:mt-10"
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-10 inset-y-8 -z-10 rounded-[2rem] bg-lc-green/[0.06] blur-[80px] pointer-events-none"
      />

      <figure className="hidden overflow-hidden rounded-2xl border border-lc-border bg-lc-dark/80 shadow-2xl shadow-black/40 backdrop-blur-sm md:block lg:mr-20">
        <Image
          src="/pictures-for-posts/desktop-large-voice-channel-with-sfu-peer-trasmission-test.png"
          alt={desktopAlt}
          width={1470}
          height={799}
          priority
          className="block h-auto w-full"
          sizes="(max-width: 1024px) 95vw, 960px"
        />
      </figure>

      <div className="hidden md:block absolute left-12 top-10 h-3 w-3 rounded-full bg-lc-green shadow-[0_0_18px_rgba(180,249,83,0.85)] animate-dot-pulse" aria-hidden="true" />
      <div className="hidden md:block absolute right-28 top-14 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-lg animate-glow-pulse" aria-hidden="true">
        3
      </div>
      <div className="hidden md:flex absolute right-40 bottom-8 items-center gap-2 rounded-full border border-lc-green/30 bg-lc-black/80 px-3 py-1.5 text-xs font-semibold text-lc-green shadow-xl shadow-black/40" aria-hidden="true">
        <span className="h-2 w-2 rounded-full bg-lc-green animate-dot-pulse" />
        {t('marketing.landing.voiceLive')}
      </div>

      <div className="mx-auto w-[168px] sm:w-[190px] md:mt-6 lg:mt-0 lg:mx-0 lg:w-[210px] lg:absolute lg:right-0 lg:-bottom-10">
        <figure className="overflow-hidden rounded-[1.75rem] border-2 border-lc-border bg-lc-dark/90 shadow-2xl shadow-black/70">
          <Image
            src="/pictures-for-posts/mobile-server-and-channels-view.png"
            alt={mobileAlt}
            width={720}
            height={1600}
            className="block h-auto w-full"
            sizes="(max-width: 1024px) 190px, 210px"
          />
        </figure>
      </div>
    </Container>
  );
}
