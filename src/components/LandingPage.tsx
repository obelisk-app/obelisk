'use client';

import { useState, useEffect, useRef, type RefObject } from 'react';
// Note: do NOT auto-redirect logged-in visitors to /app here.
// The landing page must remain reachable from /app and via direct URL,
// even when a session exists in localStorage.
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import Navbar from '@/components/Navbar';
import ObeliskIcon from '@/components/ObeliskIcon';
import ShootingStars from '@/components/ShootingStars';
import FAQItem from '@/components/FAQItem';
import Footer from '@/components/Footer';
import { useTranslation } from '@/i18n/context';
import { guidesHref } from '@/lib/guide-urls';

function useScrollReveal<T extends HTMLElement>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, visible];
}

const FEATURE_KEYS = [
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ),
    titleKey: 'features.nostrIdentity.title',
    descKey: 'features.nostrIdentity.desc',
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
      </svg>
    ),
    titleKey: 'features.realtimeChat.title',
    descKey: 'features.realtimeChat.desc',
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0110 0v4"/>
      </svg>
    ),
    titleKey: 'features.encryptedDMs.title',
    descKey: 'features.encryptedDMs.desc',
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="2" width="6" height="12" rx="3"/>
        <path d="M5 10v2a7 7 0 0014 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="22"/>
        <line x1="8" y1="22" x2="16" y2="22"/>
      </svg>
    ),
    titleKey: 'features.voice.title',
    descKey: 'features.voice.desc',
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
        <path d="M2 17l10 5 10-5"/>
        <path d="M2 12l10 5 10-5"/>
      </svg>
    ),
    titleKey: 'features.selfHosted.title',
    descKey: 'features.selfHosted.desc',
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>
    ),
    titleKey: 'features.zaps.title',
    descKey: 'features.zaps.desc',
  },
];

const STEP_ICONS = [
  <svg key="s1" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
  </svg>,
  <svg key="s2" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2L2 7l10 5 10-5-10-5z"/>
    <path d="M2 17l10 5 10-5"/>
    <path d="M2 12l10 5 10-5"/>
  </svg>,
  <svg key="s3" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
  </svg>,
];

const ROADMAP_PHASES = [
  { key: 'phase0', phase: 'Phase 0', status: 'done' as const },
  { key: 'phase1', phase: 'Phase 1', status: 'done' as const },
  { key: 'phase1_5', phase: 'Phase 1.5', status: 'done' as const },
  { key: 'phase2', phase: 'Phase 2', status: 'done' as const },
  { key: 'phase3', phase: 'Phase 3', status: 'done' as const },
  { key: 'phase6', phase: 'Phase 6', status: 'done' as const },
  { key: 'phase4', phase: 'Phase 4', status: 'done' as const },
  { key: 'phase5', phase: 'Phase 5', status: 'done' as const },
];

const TECH_STACK: { name: string; desc: string; color: string; icon?: string; img?: string; href: string }[] = [
  { name: 'Next.js 16', desc: 'React framework (frontend only)', color: 'text-white', icon: '▲', href: 'https://nextjs.org' },
  { name: 'nostr-tools', desc: 'SimplePool, signing, encryption', color: 'text-purple-400', icon: '⚡', href: 'https://github.com/nbd-wtf/nostr-tools' },
  { name: 'NIP-29', desc: 'Relay-managed groups', color: 'text-lc-green', icon: '◫', href: 'https://github.com/nostr-protocol/nips/blob/master/29.md' },
  { name: 'NIP-17', desc: 'Gift-wrapped DMs', color: 'text-pink-400', icon: '✉', href: 'https://github.com/nostr-protocol/nips/blob/master/17.md' },
  { name: 'NIP-57 + NIP-47', desc: 'Lightning zaps & NWC', color: 'text-orange-400', icon: '⚡', href: 'https://github.com/nostr-protocol/nips/blob/master/47.md' },
  { name: 'Zustand', desc: 'Client state', color: 'text-amber-400', icon: '◇', href: 'https://github.com/pmndrs/zustand' },
  { name: 'Tailwind v4', desc: 'Styling', color: 'text-cyan-400', icon: '~', href: 'https://tailwindcss.com' },
];

export default function LandingPage() {
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);
  const { t, locale } = useTranslation();

  const [previewRef, previewVisible] = useScrollReveal<HTMLElement>();
  const [featuresRef, featuresVisible] = useScrollReveal<HTMLElement>();
  const [stepsRef, stepsVisible] = useScrollReveal<HTMLElement>();
  const [roadmapRef, roadmapVisible] = useScrollReveal<HTMLElement>();
  const [stackRef, stackVisible] = useScrollReveal<HTMLElement>();
  const [learnRef, learnVisible] = useScrollReveal<HTMLElement>();
  const [ctaRef, ctaVisible] = useScrollReveal<HTMLElement>();
  const [faqRef, faqVisible] = useScrollReveal<HTMLElement>();

  const FAQ_IDS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10'] as const;
  const faqItems = FAQ_IDS.map((id) => ({
    id,
    question: t(`faq.${id}.question`),
    answer: t(`faq.${id}.answer`),
  }));
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };

  const handleLoginSuccess = () => {
    setIsNavigating(true);
    router.push('/app');
  };

  if (isNavigating) {
    return (
      <div className="h-screen flex items-center justify-center bg-lc-black">
        <div className="flex flex-col items-center gap-3">
          <div className="lc-spinner" style={{ width: 32, height: 32 }} />
          <span className="text-sm text-lc-muted">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-lc-black lc-grid-bg relative">
      <ShootingStars />
      <div className="relative z-10">
      <Navbar onLoginSuccess={handleLoginSuccess} />

      {/* Hero */}
      <section
        data-testid="landing-hero"
        className="relative pt-20 pb-10 md:pt-24 md:pb-0 px-6 overflow-hidden"
      >
        <div className="absolute inset-0 bg-lc-black/35 pointer-events-none" aria-hidden="true" />
        <div className="absolute top-24 left-1/2 -translate-x-1/2 w-[520px] h-[520px] bg-lc-green/3 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-lc-black pointer-events-none" aria-hidden="true" />

        <div className="max-w-6xl mx-auto flex flex-col items-center text-center relative z-10">
          <div className="order-2 md:order-1 flex flex-col items-center">
            <div className="relative mb-5 h-16 w-16 md:h-18 md:w-18" aria-hidden="true">
              <div className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full bg-lc-green/10 blur-xl animate-glow-pulse" />
              <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-blue-400 animate-orbit" style={{ '--orbit-radius': '28px', '--orbit-duration': '12s' } as React.CSSProperties} />
              <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-lc-green animate-orbit-reverse" style={{ '--orbit-radius': '22px', '--orbit-duration': '16s' } as React.CSSProperties} />
              <ObeliskIcon className="absolute inset-2 h-auto w-12 text-lc-green opacity-90" />
            </div>
            <h1 className={`${locale === 'es' ? 'text-xl min-[380px]:text-2xl sm:text-5xl md:text-6xl whitespace-nowrap' : 'text-4xl sm:text-5xl md:text-6xl'} font-extrabold tracking-tight leading-[1.05] mb-4 max-w-4xl`}>
              {t('hero.title')}{' '}
              <span className="text-lc-green lc-glow-text">{t('hero.titleHighlight')}</span>
            </h1>
            <p className="text-base md:text-xl text-lc-white max-w-2xl leading-relaxed">
              {t('hero.subtitle')}
            </p>
            <p className="mt-3 text-sm md:text-base text-lc-muted max-w-2xl leading-relaxed">
              {t('hero.trustLine')}
            </p>
            <div className="mt-7 flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => router.push('/app')}
                className="lc-pill lc-pill-primary text-base px-8 py-3 flex items-center justify-center gap-2"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"/>
                  <polyline points="10 17 15 12 10 7"/>
                  <line x1="15" y1="12" x2="3" y2="12"/>
                </svg>
                {t('hero.launchApp')}
              </button>
              <a
                href="https://github.com/Fabricio333/obelisk"
                target="_blank"
                rel="noopener noreferrer"
                className="lc-pill lc-pill-secondary text-base px-8 py-3 flex items-center justify-center gap-2"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                </svg>
                {t('hero.github')}
              </a>
            </div>
          </div>

          <div
            data-testid="hero-product-preview"
            className="order-1 md:order-2 relative mx-auto mt-2 mb-7 md:mt-10 md:mb-0 w-full max-w-5xl"
          >
            <div
              aria-hidden="true"
              className="absolute inset-x-10 inset-y-6 bg-lc-green/12 rounded-[2rem] blur-[80px] -z-10 pointer-events-none"
            />

            <figure className="hidden md:block rounded-2xl border border-lc-border bg-lc-dark overflow-hidden shadow-2xl shadow-black/40 lg:mr-20">
              <Image
                src="/pictures-for-posts/desktop-large-voice-channel-with-sfu-peer-trasmission-test.png"
                alt={t('landing.showcase.desktop.alt')}
                width={1470}
                height={799}
                priority
                className="w-full h-auto block"
                sizes="(max-width: 1024px) 95vw, 960px"
              />
            </figure>

            <div className="hidden md:block absolute left-12 top-10 h-3 w-3 rounded-full bg-lc-green shadow-[0_0_18px_rgba(180,249,83,0.85)] animate-dot-pulse" aria-hidden="true" />
            <div className="hidden md:block absolute right-28 top-14 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-lg animate-glow-pulse" aria-hidden="true">
              3
            </div>
            <div className="hidden md:flex absolute right-40 bottom-8 items-center gap-2 rounded-full border border-lc-green/30 bg-lc-black/80 px-3 py-1.5 text-xs font-semibold text-lc-green shadow-xl shadow-black/40" aria-hidden="true">
              <span className="h-2 w-2 rounded-full bg-lc-green animate-dot-pulse" />
              Voice live
            </div>

            <div className="mx-auto w-[168px] sm:w-[190px] md:mt-6 lg:mt-0 lg:mx-0 lg:w-[210px] lg:absolute lg:right-0 lg:-bottom-10">
              <figure className="rounded-[1.75rem] border-2 border-lc-border bg-lc-dark overflow-hidden shadow-2xl shadow-black/70">
                <Image
                  src="/pictures-for-posts/mobile-server-and-channels-view.png"
                  alt={t('landing.showcase.mobile.alt')}
                  width={720}
                  height={1600}
                  className="w-full h-auto block"
                  sizes="(max-width: 1024px) 190px, 210px"
                />
              </figure>
            </div>
          </div>
        </div>
      </section>

      {/* Relay connection pulse */}
      <div className="relative py-4 pointer-events-none" aria-hidden="true">
        <svg viewBox="0 0 500 20" className="w-full max-w-2xl mx-auto block" preserveAspectRatio="xMidYMid meet">
          {[0, 1, 2, 3].map((i) => (
            <line
              key={`line-${i}`}
              x1={50 + i * 100} y1="10" x2={150 + i * 100} y2="10"
              stroke="#b4f953"
              strokeWidth="1"
              strokeDasharray="8 6"
              className="animate-dash-flow"
              style={{ opacity: 0.3 }}
            />
          ))}
          {[0, 1, 2, 3, 4].map((i) => (
            <circle
              key={`dot-${i}`}
              cx={50 + i * 100} cy="10" r="3"
              fill="#b4f953"
              className="animate-dot-pulse"
              style={{ animationDelay: `${i * 0.6}s`, transformOrigin: `${50 + i * 100}px 10px` }}
            />
          ))}
        </svg>
      </div>

      {/* Product preview — desktop + mobile screenshots that link out to the
          per-device tour pages (/desktop and /mobile). Each card shows a real
          product screenshot with descriptive alt text for SEO; the CTAs below
          bounce visitors straight into /app. */}
      <section
        id="preview"
        ref={previewRef}
        className={`pt-12 pb-16 px-6 ${previewVisible ? 'animate-fade-in-up' : 'opacity-0'}`}
      >
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
            {/* Desktop card — image left, content right on lg+ (image on top, content below on small) */}
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

            {/* Mobile card — content left, phone right on lg+ (phone on top, content below on small) */}
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
            <button
              onClick={() => router.push('/app')}
              className="lc-pill lc-pill-primary text-base px-8 py-3 inline-flex items-center gap-2"
            >
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
            </button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" ref={featuresRef} className={`py-24 px-6 ${featuresVisible ? 'animate-fade-in-up' : 'opacity-0'}`}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {t('features.heading')}<span className="text-lc-green">.</span>
            </h2>
            <p className="text-lc-muted text-lg max-w-xl mx-auto">
              {t('features.subtitle')}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURE_KEYS.map((f) => (
              <div key={f.titleKey} className="lc-card p-6 group">
                <div className="w-12 h-12 rounded-xl bg-lc-olive/50 flex items-center justify-center text-lc-green mb-4 group-hover:bg-lc-olive transition-colors">
                  {f.icon}
                </div>
                <h3 className="text-lg font-semibold text-lc-white mb-2">{t(f.titleKey)}</h3>
                <p className="text-sm text-lc-muted leading-relaxed">{t(f.descKey)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" ref={stepsRef} className={`py-24 px-6 ${stepsVisible ? 'animate-fade-in-up' : 'opacity-0'}`}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {t('steps.heading')}<span className="text-lc-green">.</span>
            </h2>
            <p className="text-lc-muted text-lg">{t('steps.subtitle')}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
            {/* Connector line (desktop only) */}
            <div className="hidden md:block absolute top-12 left-[calc(33.33%+0.75rem)] right-[calc(33.33%+0.75rem)] h-px bg-gradient-to-r from-lc-green/30 via-lc-green/20 to-lc-green/30" />
            {[1, 2, 3].map((num, i) => (
              <div key={num} className="lc-card p-6 relative group">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-lc-green/10 border border-lc-green/30 flex items-center justify-center text-lc-green text-sm font-bold group-hover:bg-lc-green/20 transition-colors">
                    {String(num).padStart(2, '0')}
                  </div>
                  <div className="w-9 h-9 rounded-lg bg-lc-olive/30 flex items-center justify-center text-lc-green">
                    {STEP_ICONS[i]}
                  </div>
                </div>
                <h3 className="text-lg font-semibold text-lc-white mb-2">{t(`steps.${num}.title`)}</h3>
                <p className="text-sm text-lc-muted leading-relaxed">{t(`steps.${num}.desc`)}</p>
                {i < 2 && (
                  <div className="md:hidden flex justify-center py-2 mt-4 text-lc-green/30">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 5v14M5 12l7 7 7-7"/>
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Roadmap — vertical timeline */}
      <section id="roadmap" ref={roadmapRef} className={`py-24 px-6 ${roadmapVisible ? 'animate-fade-in-up' : 'opacity-0'}`}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {t('roadmap.heading')}<span className="text-lc-green">.</span>
            </h2>
            <p className="text-lc-muted text-lg max-w-xl mx-auto">
              {t('roadmap.subtitle')}
            </p>
          </div>
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-4 md:left-6 top-0 bottom-0 w-px bg-gradient-to-b from-lc-green/40 via-lc-green/20 to-lc-border" />

            <div className="space-y-8">
              {ROADMAP_PHASES.map((r) => {
                const items = t(`roadmap.${r.key}.items`).split('|');
                return (
                  <div key={r.key} className="relative pl-12 md:pl-16">
                    {/* Timeline dot */}
                    <div className={`absolute left-2.5 md:left-4.5 top-1.5 w-3 h-3 rounded-full border-2 ${
                      r.status === 'done'
                        ? 'bg-lc-green border-lc-green'
                        : 'bg-lc-dark border-lc-border'
                    }`} />

                    <div className="lc-card p-5">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-xs font-bold text-lc-green">{r.phase}</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          r.status === 'done'
                            ? 'bg-lc-green/20 text-lc-green'
                            : 'bg-lc-border text-lc-muted'
                        }`}>
                          {r.status === 'done' ? `✓ ${t('roadmap.done')}` : t('roadmap.upcoming')}
                        </span>
                      </div>
                      <h4 className="text-lg font-semibold text-lc-white mb-2">{t(`roadmap.${r.key}.title`)}</h4>
                      <ul className="space-y-1">
                        {items.map((item) => (
                          <li key={item} className="text-sm text-lc-muted flex items-start gap-2">
                            {r.status === 'done' ? (
                              <span className="text-lc-green mt-0.5 text-xs">✓</span>
                            ) : (
                              <span className="text-lc-border mt-1.5 text-[8px]">●</span>
                            )}
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Learn / Guides */}
      <section id="learn" ref={learnRef} className={`py-24 px-6 ${learnVisible ? 'animate-fade-in-up' : 'opacity-0'}`}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {t('learn.heading')}<span className="text-lc-green">.</span>
            </h2>
            <p className="text-lc-muted text-lg max-w-xl mx-auto">
              {t('learn.subtitle')}
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {[
              { slug: 'what-is-obelisk', tKey: 'whatIsObelisk' },
              { slug: 'how-obelisk-works', tKey: 'howObeliskWorks' },
              { slug: 'web-of-trust', tKey: 'webOfTrust' },
              { slug: 'bitcoin-zaps', tKey: 'bitcoinZaps' },
              { slug: 'admin-cli', tKey: 'adminCli' },
              { slug: 'future-nostr-relays', tKey: 'futureNostrRelays' },
            ].map((g) => (
              <Link
                key={g.slug}
                href={guidesHref(locale, g.slug)}
                className="lc-card p-6 group"
              >
                <h3 className="text-lg font-bold text-lc-white group-hover:text-lc-green transition-colors">
                  {t(`learn.card.${g.tKey}.title`)}
                </h3>
                <p className="mt-2 text-sm text-lc-muted">
                  {t(`learn.card.${g.tKey}.desc`)}
                </p>
                <div className="mt-4 text-xs text-lc-green font-semibold">
                  {t('learn.cta')} →
                </div>
              </Link>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link
              href={guidesHref(locale)}
              className="lc-pill lc-pill-secondary text-sm inline-flex items-center gap-2"
            >
              {t('learn.cta')} <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Tech Stack */}
      <section id="stack" ref={stackRef} className={`py-24 px-6 ${stackVisible ? 'animate-fade-in-up' : 'opacity-0'}`}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {t('stack.heading')}<span className="text-lc-green">.</span>
            </h2>
            <p className="text-lc-muted text-lg max-w-xl mx-auto">
              {t('stack.subtitle')}
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {TECH_STACK.map((tech) => (
              <a
                key={tech.name}
                href={tech.href}
                target="_blank"
                rel="noopener noreferrer"
                className="lc-card p-5 group hover:border-lc-green/20 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {tech.img ? (
                    <img src={tech.img} alt={tech.name} className="w-10 h-10 rounded-lg shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-lc-olive/30 flex items-center justify-center text-sm shrink-0">
                      <span className={tech.color}>{tech.icon}</span>
                    </div>
                  )}
                  <div>
                    <h3 className={`text-sm font-bold ${tech.color} group-hover:scale-105 transition-transform origin-left`}>
                      {tech.name}
                    </h3>
                    <p className="text-xs text-lc-muted">{tech.desc}</p>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section ref={ctaRef} className={`py-24 px-6 ${ctaVisible ? 'animate-fade-in-up' : 'opacity-0'}`}>
        <div className="max-w-3xl mx-auto text-center">
          <div className="lc-card p-12 lc-glow">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {t('cta.heading')}<span className="text-lc-green">?</span>
            </h2>
            <p className="text-lc-muted text-lg mb-8 max-w-lg mx-auto">
              {t('cta.subtitle')}
            </p>
            <button
              onClick={() => router.push('/app')}
              className="lc-pill lc-pill-primary text-base px-10 py-3.5"
            >
              {t('cta.button')}
            </button>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section
        id="faq"
        ref={faqRef}
        className={`py-24 px-6 ${faqVisible ? 'animate-fade-in-up' : 'opacity-0'}`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {t('faq.heading')}<span className="text-lc-green">.</span>
            </h2>
            <p className="text-lc-muted text-lg max-w-xl mx-auto">
              {t('faq.subtitle')}
            </p>
          </div>
          <div className="space-y-3">
            {faqItems.map((item) => (
              <FAQItem
                key={item.id}
                id={item.id}
                question={item.question}
                answer={item.answer}
              />
            ))}
          </div>
        </div>
      </section>

      <Footer />

      {/* Login modal removed: bridge-backed login lives at /app. */}
      </div>
    </main>
  );
}
