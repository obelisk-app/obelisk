'use client';

import { useTranslation } from '@/i18n/context';
import Image from 'next/image';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import RevealSection from './RevealSection';

/**
 * Product preview: desktop + mobile screenshots that link out to the
 * per-device tour pages (/desktop and /mobile). Each card shows a real
 * product screenshot with descriptive alt text for SEO; the CTAs below
 * bounce visitors straight into /app.
 */
export default function PreviewSection({ onLaunch }: { onLaunch: () => void }) {
  const { t } = useTranslation();
  return (
    <RevealSection id="preview" className="pt-12 pb-16 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            {t('landing.preview.heading')}<span className="text-lc-green">.</span>
          </h2>
          <p className="text-lc-muted text-lg max-w-2xl mx-auto">
            {t('landing.preview.subtitle')}
          </p>
        </div>

        <div className="space-y-6 max-w-5xl mx-auto">
          {/* Desktop card: image left, content right on lg+ (image on top, content below on small) */}
          <Link
            href="/desktop"
            className="lc-card group p-6 lg:p-8 flex flex-col lg:grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-10 lg:items-center"
            data-testid="landing-preview-desktop"
          >
            <figure className="rounded-xl border border-lc-border overflow-hidden bg-lc-dark">
              <Image
                src="/pictures-for-posts/desktop-large-voice-channel-with-sfu-peer-trasmission-test.png"
                alt={t('landing.preview.desktop.alt')}
                width={1470}
                height={799}
                className="w-full h-auto block transition-transform duration-500 group-hover:scale-[1.015]"
                sizes="(max-width: 1024px) 90vw, 600px"
              />
            </figure>
            <div className="mt-6 lg:mt-0 flex flex-col">
              <span className="self-start inline-flex items-center gap-2 px-3 py-1 rounded-full bg-lc-olive/40 border border-lc-green/20 text-xs font-semibold text-lc-green tracking-wide uppercase">
                {t('landing.preview.desktop.badge')}
              </span>
              <h3 className="mt-4 text-xl md:text-2xl font-bold text-lc-white">
                {t('landing.preview.desktop.title')}
              </h3>
              <p className="mt-2 text-sm md:text-base text-lc-muted leading-relaxed">
                {t('landing.preview.desktop.desc')}
              </p>
              <span className="mt-6 text-sm font-semibold text-lc-green inline-flex items-center gap-2 group-hover:underline">
                {t('landing.preview.desktop.cta')}
                <span aria-hidden="true">→</span>
              </span>
            </div>
          </Link>

          {/* Mobile card: content left, phone right on lg+ (phone on top, content below on small) */}
          <Link
            href="/mobile"
            className="lc-card group p-6 lg:p-8 flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_220px] lg:gap-10 lg:items-center"
            data-testid="landing-preview-mobile"
          >
            <figure className="lg:order-2 mx-auto w-full max-w-[200px] lg:mx-0 lg:max-w-none lg:w-full rounded-[2rem] border border-lc-border overflow-hidden bg-lc-dark">
              <Image
                src="/pictures-for-posts/mobile-server-and-channels-view.png"
                alt={t('landing.preview.mobile.alt')}
                width={720}
                height={1600}
                className="w-full h-auto block transition-transform duration-500 group-hover:scale-[1.015]"
                sizes="(max-width: 1024px) 60vw, 220px"
              />
            </figure>
            <div className="lg:order-1 mt-6 lg:mt-0 flex flex-col">
              <span className="self-start inline-flex items-center gap-2 px-3 py-1 rounded-full bg-lc-olive/40 border border-lc-green/20 text-xs font-semibold text-lc-green tracking-wide uppercase">
                {t('landing.preview.mobile.badge')}
              </span>
              <h3 className="mt-4 text-xl md:text-2xl font-bold text-lc-white">
                {t('landing.preview.mobile.title')}
              </h3>
              <p className="mt-2 text-sm md:text-base text-lc-muted leading-relaxed">
                {t('landing.preview.mobile.desc')}
              </p>
              <span className="mt-6 text-sm font-semibold text-lc-green inline-flex items-center gap-2 group-hover:underline">
                {t('landing.preview.mobile.cta')}
                <span aria-hidden="true">→</span>
              </span>
            </div>
          </Link>
        </div>

        <div className="mt-10 flex justify-center">
          <Button variant="pill" size="lg" onClick={() => onLaunch()}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" y1="12" x2="3" y2="12" />
            </svg>
            {t('hero.launchApp')}
          </Button>
        </div>
      </div>
    </RevealSection>
  );
}
