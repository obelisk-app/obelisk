import ObeliskIcon from '@/components/ui/icons/ObeliskIcon';

/** The decorative relay animation beside the hero copy. */
export default function LandingHeroAnimation() {
  return (
    <div
      data-testid="hero-animation"
      className="relative mx-auto h-[330px] w-full max-w-[520px] min-w-0 overflow-visible pointer-events-none opacity-85 [mask-image:radial-gradient(ellipse_at_center,black_58%,transparent_82%)] lg:h-[440px]"
      aria-hidden="true"
    >
      <div className="absolute left-1/2 top-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full bg-lc-green/[0.06] blur-[90px] pointer-events-none" />

      <div className="absolute inset-0 overflow-visible pointer-events-none">
        {[
          { left: '8%', bottom: '-10%', size: 16, opacity: 0.06, duration: '18s', delay: '0s' },
          { left: '18%', bottom: '-15%', size: 20, opacity: 0.08, duration: '22s', delay: '3s' },
          { left: '30%', bottom: '-5%', size: 12, opacity: 0.05, duration: '16s', delay: '7s' },
          { left: '42%', bottom: '-20%', size: 24, opacity: 0.1, duration: '25s', delay: '1s' },
          { left: '55%', bottom: '-8%', size: 14, opacity: 0.07, duration: '19s', delay: '5s' },
          { left: '65%', bottom: '-12%', size: 18, opacity: 0.09, duration: '21s', delay: '9s' },
          { left: '75%', bottom: '-18%', size: 22, opacity: 0.06, duration: '24s', delay: '2s' },
          { left: '88%', bottom: '-6%', size: 15, opacity: 0.08, duration: '17s', delay: '6s' },
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

      <div className="absolute left-1/2 top-1/2 h-[260px] w-[330px] -translate-x-1/2 -translate-y-1/2 pointer-events-none sm:w-[380px] lg:h-[320px] lg:w-[440px]">
        <div
          className="absolute left-1/2 -translate-x-1/2"
          style={{ top: -60, width: 300, height: 320, clipPath: 'inset(0 0 50% 0)' }}
        >
          <div className="relative w-full" style={{ height: 320 }}>
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-yellow-400 animate-orbit-vertical drop-shadow-[0_0_10px_rgba(250,204,21,0.6)]"
              style={{ '--orbit-radius': '120px', '--orbit-duration': '28s' } as React.CSSProperties}
            >
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-slate-300 animate-orbit-vertical drop-shadow-[0_0_8px_rgba(203,213,225,0.5)]"
              style={{ '--orbit-radius': '120px', '--orbit-duration': '28s', animationDelay: '-14s' } as React.CSSProperties}
            >
              <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
            </svg>
          </div>
        </div>

        <div className="absolute top-1/2 left-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-lc-green/8 animate-glow-pulse" />

        {[
          { size: 3, x: '15%', y: '20%', delay: '0s', dur: '6s' },
          { size: 2, x: '80%', y: '30%', delay: '2s', dur: '8s' },
          { size: 3, x: '85%', y: '75%', delay: '4s', dur: '7s' },
          { size: 2, x: '10%', y: '70%', delay: '1s', dur: '9s' },
        ].map((p, i) => (
          <div
            key={'particle-' + i}
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

        <div className="relative h-full w-full" style={{ transform: 'scaleY(0.35)' }}>
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-blue-500 animate-orbit drop-shadow-[0_0_8px_rgba(59,130,246,0.6)]"
            style={{ '--orbit-radius': '118px', '--orbit-duration': '16s', transform: 'scaleY(2.85)' } as React.CSSProperties}
          >
            <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
          </svg>
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-red-500 animate-orbit drop-shadow-[0_0_8px_rgba(239,68,68,0.6)]"
            style={{ '--orbit-radius': '118px', '--orbit-duration': '16s', animationDelay: '-8s', transform: 'scaleY(2.85)' } as React.CSSProperties}
          >
            <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
          </svg>
        </div>
      </div>

      <ObeliskIcon className="absolute left-1/2 top-1/2 h-auto w-24 -translate-x-1/2 -translate-y-1/2 text-lc-green opacity-90 drop-shadow-[0_0_36px_rgba(180,249,83,0.28)] sm:w-28 lg:w-32" />
    </div>
  );
}
