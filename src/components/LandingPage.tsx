'use client';

import { useState, useEffect, useRef, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import LoginModal from '@/components/LoginModal';
import ObeliskIcon from '@/components/ObeliskIcon';
import ShootingStars from '@/components/ShootingStars';
import FAQItem from '@/components/FAQItem';
import Footer from '@/components/Footer';
import { useTranslation } from '@/i18n/context';

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
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 00-3-3.87"/>
        <path d="M16 3.13a4 4 0 010 7.75"/>
      </svg>
    ),
    titleKey: 'features.roles.title',
    descKey: 'features.roles.desc',
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
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        <path d="M9 12l2 2 4-4"/>
      </svg>
    ),
    titleKey: 'features.spamResistant.title',
    descKey: 'features.spamResistant.desc',
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
  { key: 'phase4', phase: 'Phase 4', status: 'in-progress' as const },
];

const TECH_STACK: { name: string; desc: string; color: string; icon?: string; img?: string; href: string }[] = [
  { name: 'Next.js 16', desc: 'React framework', color: 'text-white', icon: '▲', href: 'https://nextjs.org' },
  { name: 'Nostr (NDK)', desc: 'Identity & auth', color: 'text-purple-400', icon: '⚡', href: 'https://github.com/nostr-dev-kit/ndk' },
  { name: 'Nostr WoT', desc: 'Web of Trust spam filter', color: 'text-indigo-400', img: '/nostr-wot-logo.png', href: 'https://nostr-wot.com' },
  { name: 'WebRTC', desc: 'Voice channels', color: 'text-rose-400', icon: '🎙', href: 'https://webrtc.org' },
  { name: 'Socket.io', desc: 'Real-time messaging', color: 'text-yellow-400', icon: '⇌', href: 'https://socket.io' },
  { name: 'PostgreSQL', desc: 'Database', color: 'text-emerald-400', icon: '◆', href: 'https://www.postgresql.org' },
];

export default function LandingPage() {
  const router = useRouter();
  const [showLogin, setShowLogin] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const { t, locale } = useTranslation();

  // Auto-open login modal if a NostrConnect session was in progress
  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      const inProgress = localStorage.getItem('obelisk-auth-in-progress');
      if (inProgress === 'true') {
        setShowLogin(true);
      }
    }
  }, []);

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
    // Client-side nav preserves NDK's in-memory signer (nsec private key
    // lives only in memory — a full reload would kill it and /chat would
    // force-logout). The cookie-commit race is handled by a retry inside
    // restoreSession() in the auth store.
    router.push('/chat');
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
      <section className="relative pt-32 pb-24 px-6 overflow-hidden">
        {/* Glow behind obelisk */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-lc-green/5 rounded-full blur-[120px] pointer-events-none" />

        {/* Floating chat bubbles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          {[
            { left: '8%',  bottom: '-10%', size: 16, opacity: 0.06, duration: '18s', delay: '0s' },
            { left: '18%', bottom: '-15%', size: 20, opacity: 0.08, duration: '22s', delay: '3s' },
            { left: '30%', bottom: '-5%',  size: 12, opacity: 0.05, duration: '16s', delay: '7s' },
            { left: '42%', bottom: '-20%', size: 24, opacity: 0.1,  duration: '25s', delay: '1s' },
            { left: '55%', bottom: '-8%',  size: 14, opacity: 0.07, duration: '19s', delay: '5s' },
            { left: '65%', bottom: '-12%', size: 18, opacity: 0.09, duration: '21s', delay: '9s' },
            { left: '75%', bottom: '-18%', size: 22, opacity: 0.06, duration: '24s', delay: '2s' },
            { left: '88%', bottom: '-6%',  size: 15, opacity: 0.08, duration: '17s', delay: '6s' },
          ].map((b, i) => (
            <svg
              key={i}
              width={b.size}
              height={b.size}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="absolute text-lc-green animate-float-up"
              style={{
                left: b.left,
                bottom: b.bottom,
                '--bubble-opacity': b.opacity,
                '--float-duration': b.duration,
                '--float-delay': b.delay,
              } as React.CSSProperties}
            >
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
          ))}
        </div>

        {/* Orbiting Nostr keys + sun/moon around obelisk */}
        <div className="absolute top-28 left-1/2 -translate-x-1/2 pointer-events-none" aria-hidden="true" style={{ width: 300, height: 200 }}>
          {/* Sun & Moon — vertical orbit, bottom half clipped to hide behind obelisk */}
          <div className="absolute left-1/2 -translate-x-1/2" style={{ top: -60, width: 300, height: 320, clipPath: 'inset(0 0 50% 0)' }}>
            <div className="relative w-full" style={{ height: 320 }}>
              {/* Sun */}
              <svg
                width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-yellow-400 animate-orbit-vertical drop-shadow-[0_0_10px_rgba(250,204,21,0.6)]"
                style={{ '--orbit-radius': '120px', '--orbit-duration': '28s' } as React.CSSProperties}
              >
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
              {/* Moon — opposite side */}
              <svg
                width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-slate-300 animate-orbit-vertical drop-shadow-[0_0_8px_rgba(203,213,225,0.5)]"
                style={{ '--orbit-radius': '120px', '--orbit-duration': '28s', animationDelay: '-14s' } as React.CSSProperties}
              >
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
              </svg>
            </div>
          </div>

          {/* Pulsing glow behind obelisk */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-lc-green/8 rounded-full animate-glow-pulse" />

          {/* Floating particles */}
          {[
            { size: 3, x: '15%', y: '20%', delay: '0s', dur: '6s' },
            { size: 2, x: '80%', y: '30%', delay: '2s', dur: '8s' },
            { size: 3, x: '85%', y: '75%', delay: '4s', dur: '7s' },
            { size: 2, x: '10%', y: '70%', delay: '1s', dur: '9s' },
          ].map((p, i) => (
            <div
              key={`particle-${i}`}
              className="absolute rounded-full bg-lc-green animate-particle"
              style={{
                width: p.size,
                height: p.size,
                left: p.x,
                top: p.y,
                '--particle-delay': p.delay,
                '--particle-duration': p.dur,
              } as React.CSSProperties}
            />
          ))}

          {/* 3D orbit container — scaleY creates the perspective ellipse */}
          <div className="relative w-full h-full" style={{ transform: 'scaleY(0.35)' }}>
            {/* Key 1 (Blue) */}
            <svg
              width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-blue-500 animate-orbit drop-shadow-[0_0_8px_rgba(59,130,246,0.6)]"
              style={{ '--orbit-radius': '90px', '--orbit-duration': '16s', transform: 'scaleY(2.85)' } as React.CSSProperties}
            >
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
            </svg>
            {/* Key 2 (Red) — opposite side */}
            <svg
              width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-red-500 animate-orbit drop-shadow-[0_0_8px_rgba(239,68,68,0.6)]"
              style={{ '--orbit-radius': '90px', '--orbit-duration': '16s', animationDelay: '-8s', transform: 'scaleY(2.85)' } as React.CSSProperties}
            >
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
            </svg>

          </div>
        </div>

        <div className="max-w-6xl mx-auto flex flex-col items-center text-center relative z-10">
          <ObeliskIcon className="w-24 h-auto mb-8 text-lc-green opacity-90" />
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-[1.1] mb-6">
            {t('hero.title')}{' '}
            <span className="text-lc-green lc-glow-text">{t('hero.titleHighlight')}</span>
          </h1>
          <p className="text-lg md:text-xl text-lc-muted max-w-2xl mb-10 leading-relaxed">
            {t('hero.subtitle')}
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={() => setShowLogin(true)}
              className="lc-pill lc-pill-primary text-base px-8 py-3 flex items-center gap-2"
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
              className="lc-pill lc-pill-secondary text-base px-8 py-3 flex items-center gap-2"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              {t('hero.github')}
            </a>
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
                        : r.status === 'in-progress'
                          ? 'bg-lc-green/50 border-lc-green animate-pulse'
                          : 'bg-lc-dark border-lc-border'
                    }`} />

                    <div className="lc-card p-5">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-xs font-bold text-lc-green">{r.phase}</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          r.status === 'done'
                            ? 'bg-lc-green/20 text-lc-green'
                            : r.status === 'in-progress'
                              ? 'bg-lc-green/10 text-lc-green animate-pulse'
                              : 'bg-lc-border text-lc-muted'
                        }`}>
                          {r.status === 'done' ? `✓ ${t('roadmap.done')}` : r.status === 'in-progress' ? t('roadmap.inProgress') : t('roadmap.upcoming')}
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
              { slug: 'future-nostr-relays', tKey: 'futureNostrRelays' },
            ].map((g) => (
              <Link
                key={g.slug}
                href={`/guides/${locale}/${g.slug}`}
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
              href={`/guides/${locale}`}
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
              onClick={() => setShowLogin(true)}
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
          <div
            className="space-y-3"
            itemScope
            itemType="https://schema.org/FAQPage"
          >
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

      <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} onSuccess={handleLoginSuccess} />
      </div>
    </main>
  );
}
