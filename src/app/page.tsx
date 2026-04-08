'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import LoginModal from '@/components/LoginModal';
import ObeliskIcon from '@/components/ObeliskIcon';

const FEATURES = [
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ),
    title: 'Nostr Identity',
    description: 'Sign in with your Nostr keys. No email, no password. Your cryptographic identity is your passport.',
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
      </svg>
    ),
    title: 'Real-time Channels',
    description: 'Discord-like channels with WebSocket messaging. Threads, reactions, and media — all in real-time.',
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0110 0v4"/>
      </svg>
    ),
    title: 'Encrypted DMs',
    description: 'Private messages encrypted via Nostr relays. Only you and the recipient can read them.',
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
    title: 'Roles & Permissions',
    description: 'Admin, moderator, and member roles. Control who can do what in your server.',
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
        <path d="M2 17l10 5 10-5"/>
        <path d="M2 12l10 5 10-5"/>
      </svg>
    ),
    title: 'Self-Hosted',
    description: 'Run your own server. Your data, your rules. No corporate middlemen.',
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="2" y1="12" x2="22" y2="12"/>
        <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
      </svg>
    ),
    title: 'Open Protocol',
    description: 'Built on Nostr — an open, censorship-resistant protocol. Interoperable by design.',
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        <path d="M9 12l2 2 4-4"/>
      </svg>
    ),
    title: 'Spam Resistant',
    description: 'Web of Trust filtering powered by Nostr identity. Verify who is who through your social graph — no CAPTCHAs needed.',
  },
];

const STEPS = [
  {
    num: '01',
    title: 'Sign in with Nostr',
    description: 'Use a browser extension (NIP-07), paste your nsec, or scan a QR code for NIP-46 bunker login.',
  },
  {
    num: '02',
    title: 'Join a server',
    description: 'Enter an invite link or create your own server. Each server is independently hosted.',
  },
  {
    num: '03',
    title: 'Start chatting',
    description: 'Jump into channels, send messages, react, thread replies — just like you\'re used to, but sovereign.',
  },
];

const ROADMAP = [
  {
    phase: 'Phase 1',
    title: 'Auth + Basic Chat',
    status: 'in-progress' as const,
    items: ['Nostr challenge-response auth', 'Channel CRUD & messaging', 'WebSocket real-time', 'Threads & media'],
  },
  {
    phase: 'Phase 2',
    title: 'Core Features',
    status: 'upcoming' as const,
    items: ['Voice channels (WebRTC)', 'Roles & permissions', 'Invite system', 'DMs via Nostr relays'],
  },
  {
    phase: 'Phase 3',
    title: 'Advanced',
    status: 'upcoming' as const,
    items: ['App profiles', 'File uploads', 'Search', 'Bot integrations'],
  },
  {
    phase: 'Phase 4',
    title: 'Open Database',
    status: 'upcoming' as const,
    items: ['Public-access chat archives', 'Full-text search engine', 'Public threads visible on the web', 'SEO-friendly thread pages'],
  },
  {
    phase: 'Phase 5',
    title: 'Polish & Launch',
    status: 'upcoming' as const,
    items: ['Push notifications', 'Custom themes', 'Mobile optimization', 'Production deploy'],
  },
];

export default function Home() {
  const [showLogin, setShowLogin] = useState(false);
  const router = useRouter();

  const handleLoginSuccess = () => {
    router.push('/chat');
  };

  return (
    <main className="min-h-screen bg-lc-black lc-grid-bg">
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
            { left: '50%', bottom: '-14%', size: 13, opacity: 0.05, duration: '20s', delay: '11s' },
            { left: '35%', bottom: '-16%', size: 19, opacity: 0.07, duration: '23s', delay: '4s' },
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

        {/* Orbiting Nostr key pair */}
        <div className="absolute top-32 left-1/2 -translate-x-1/2 pointer-events-none" aria-hidden="true" style={{ width: 200, height: 80 }}>
          <div className="relative w-full h-full" style={{ transform: 'scaleY(0.4)' }}>
            {/* Public key (outline) */}
            <svg
              width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-lc-green animate-orbit"
              style={{ '--orbit-duration': '20s', transform: 'scaleY(2.5)' } as React.CSSProperties}
            >
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
            </svg>
            {/* Private key (filled) */}
            <svg
              width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-lc-green animate-orbit"
              style={{ '--orbit-duration': '20s', animationDelay: '-10s', transform: 'scaleY(2.5)' } as React.CSSProperties}
            >
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
            </svg>
          </div>
        </div>

        <div className="max-w-6xl mx-auto flex flex-col items-center text-center relative z-10">
          <ObeliskIcon className="w-24 h-auto mb-8 text-lc-green opacity-90" />
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-[1.1] mb-6">
            Chat with{' '}
            <span className="text-lc-green lc-glow-text">Nostr Identity</span>
          </h1>
          <p className="text-lg md:text-xl text-lc-muted max-w-2xl mb-10 leading-relaxed">
            Discord-like servers and channels, powered by your Nostr keys.
            No email. No corporation. Just cryptographic identity and real-time chat.
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
              Launch App
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
              GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Relay connection pulse */}
      <div className="relative py-4 pointer-events-none" aria-hidden="true">
        <svg viewBox="0 0 500 20" className="w-full max-w-2xl mx-auto block" preserveAspectRatio="xMidYMid meet">
          {/* Dashed connecting lines */}
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
          {/* Relay dots */}
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
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Built different<span className="text-lc-green">.</span>
            </h2>
            <p className="text-lc-muted text-lg max-w-xl mx-auto">
              The best of Discord&apos;s UX with Nostr&apos;s sovereign identity model.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div key={f.title} className="lc-card p-6 group">
                <div className="w-12 h-12 rounded-xl bg-lc-olive/50 flex items-center justify-center text-lc-green mb-4 group-hover:bg-lc-olive transition-colors">
                  {f.icon}
                </div>
                <h3 className="text-lg font-semibold text-lc-white mb-2">{f.title}</h3>
                <p className="text-sm text-lc-muted leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Three steps<span className="text-lc-green">.</span>
            </h2>
            <p className="text-lc-muted text-lg">No signup forms. No email verification. Just keys.</p>
          </div>
          <div className="space-y-8">
            {STEPS.map((s) => (
              <div key={s.num} className="flex gap-6 items-start">
                <div className="text-4xl font-extrabold text-lc-green/20 select-none leading-none pt-1">
                  {s.num}
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-lc-white mb-1">{s.title}</h3>
                  <p className="text-lc-muted leading-relaxed">{s.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Roadmap */}
      <section id="roadmap" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Roadmap<span className="text-lc-green">.</span>
            </h2>
            <p className="text-lc-muted text-lg max-w-xl mx-auto">
              We&apos;re building this in the open. Here&apos;s what&apos;s coming.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {ROADMAP.map((r) => (
              <div key={r.phase} className="lc-card p-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    r.status === 'in-progress'
                      ? 'bg-lc-green/20 text-lc-green'
                      : 'bg-lc-border text-lc-muted'
                  }`}>
                    {r.status === 'in-progress' ? 'In Progress' : 'Upcoming'}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-lc-green mb-1">{r.phase}</h3>
                <h4 className="text-lg font-semibold text-lc-white mb-3">{r.title}</h4>
                <ul className="space-y-1.5">
                  {r.items.map((item) => (
                    <li key={item} className="text-sm text-lc-muted flex items-start gap-2">
                      <span className="text-lc-border mt-1.5 text-[8px]">&#9679;</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tech Stack */}
      <section id="stack" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Tech stack<span className="text-lc-green">.</span>
            </h2>
            <p className="text-lc-muted text-lg max-w-xl mx-auto">
              Modern, open-source tools — no vendor lock-in.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[
              { name: 'Next.js 16', desc: 'React framework', color: 'text-white' },
              { name: 'TypeScript', desc: 'Type safety', color: 'text-blue-400' },
              { name: 'Tailwind CSS', desc: 'Utility-first styling', color: 'text-cyan-400' },
              { name: 'NDK', desc: 'Nostr Dev Kit', color: 'text-purple-400' },
              { name: 'Zustand', desc: 'State management', color: 'text-orange-400' },
              { name: 'Prisma', desc: 'Database ORM', color: 'text-emerald-400' },
            ].map((tech) => (
              <div key={tech.name} className="lc-card p-5 text-center group">
                <h3 className={`text-sm font-bold ${tech.color} mb-1 group-hover:scale-105 transition-transform`}>
                  {tech.name}
                </h3>
                <p className="text-xs text-lc-muted">{tech.desc}</p>
              </div>
            ))}
            <div className="lc-card p-5 text-center group col-span-2">
              <div className="flex items-center justify-center gap-3">
                <img src="/nostr-wot-logo.png" alt="Nostr WoT" className="w-10 h-10 rounded-lg" />
                <div className="text-left">
                  <h3 className="text-sm font-bold text-indigo-400 group-hover:scale-105 transition-transform">Nostr WoT</h3>
                  <p className="text-xs text-lc-muted">Web of Trust spam filtering</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="lc-card p-12 lc-glow">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Ready to chat sovereign<span className="text-lc-green">?</span>
            </h2>
            <p className="text-lc-muted text-lg mb-8 max-w-lg mx-auto">
              Connect with your Nostr identity and join the conversation.
            </p>
            <button
              onClick={() => setShowLogin(true)}
              className="lc-pill lc-pill-primary text-base px-10 py-3.5"
            >
              Get Started
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-lc-border/50 py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-lc-muted">
            <ObeliskIcon className="w-5 h-5 text-lc-muted opacity-60" />
            Obelisk — Built for La Crypta Identity Hackathon 2026
          </div>
          <div className="flex items-center gap-6 text-sm text-lc-muted">
            <a href="https://lacrypta.ar" target="_blank" rel="noopener noreferrer" className="hover:text-lc-white transition-colors">
              La Crypta
            </a>
            <a href="https://nosta.me/nprofile1qqsdjkgdjkncz8sukvftuehd6ejd0clxa4tcy2ke7gf76cs0ce6gh6qpz3mhxue69uhhyetvv9ujuerpd46hxtnfduqs6amnwvaz7tmwdaejumr0dsvlpy8j" target="_blank" rel="noopener noreferrer" className="hover:text-lc-white transition-colors">
              Nostr
            </a>
            <a href="https://github.com/Fabricio333/obelisk" target="_blank" rel="noopener noreferrer" className="hover:text-lc-white transition-colors">
              GitHub
            </a>
          </div>
        </div>
      </footer>

      <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} onSuccess={handleLoginSuccess} />
    </main>
  );
}
