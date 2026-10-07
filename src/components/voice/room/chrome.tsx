'use client';

/**
 * Room chrome: the passive (pre-join) roster, the backdrop, the scrollable
 * side rail and the small centered panels. The header and its topology
 * pills are `header.tsx`. Pure presentation; the only state is the rail's
 * scroll affordance.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useUserMetadata as useProfile } from '@/services/nostr-bridge';
import ShootingStars from '@/components/common/ShootingStars';
import { useTranslations } from 'next-intl';
import { Avatar } from './tiles';
import IconButton from '@/components/ui/buttons/IconButton';

export function PassiveCallRoster({ pubkeys, count, mode }: {
  pubkeys: readonly string[];
  count: number;
  mode?: 'sfu' | 'mesh';
}) {
  const t = useTranslations();
  if (count <= 0 && pubkeys.length === 0) return null;
  const visible = pubkeys.slice(0, 6);
  const hidden = Math.max(0, count - visible.length);
  const topology = mode === 'sfu' ? 'SFU' : mode === 'mesh' ? 'Mesh' : t('voice.roster.live'); // i18n-exempt: SFU and Mesh are topology names
  return (
    <div
      className="mx-auto mb-1 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-left"
      data-testid="passive-call-roster"
    >
      <div className="mb-2 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.12em] text-lc-muted">
        <span>{t('voice.inCall')}</span>
        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-lc-white/75">{topology}</span>
      </div>
      {visible.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {visible.map((pk) => <PassiveCallParticipant key={pk} pubkey={pk} />)}
          {hidden > 0 && (
            <span className="inline-flex min-w-0 items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-lc-muted">
              {t('voice.roster.more', { count: hidden })}
            </span>
          )}
        </div>
      ) : (
        <div className="text-xs text-lc-muted">
          {count > 0 ? t('voice.roster.syncingCount', { count }) : t('voice.roster.syncing')}
        </div>
      )}
    </div>
  );
}

function PassiveCallParticipant({ pubkey }: { pubkey: string }) {
  const meta = useProfile(pubkey);
  const name = meta?.displayName || meta?.name || pubkey.slice(0, 8);
  return (
    <span
      className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-lc-white/85"
      data-testid="passive-call-participant"
      title={pubkey}
    >
      <Avatar pubkey={pubkey} picture={meta?.picture} name={name} size={5} />
      <span className="truncate">{name}</span>
    </span>
  );
}

export function StageBackdrop() {
  return (
    <>
      {/* Matrix grid overlay - restored from the legacy VoiceChannel look. */}
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        aria-hidden
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />
      <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden>
        <ShootingStars contained count={8} />
      </div>
      <div
        className="absolute inset-0 z-0 opacity-60 pointer-events-none"
        aria-hidden
        style={{
          background:
            'radial-gradient(60% 50% at 50% 0%, rgba(180,249,83,0.05), transparent 70%), radial-gradient(50% 40% at 100% 100%, rgba(99,102,241,0.10), transparent 70%)',
        }}
      />
    </>
  );
}

export function ScrollableRail({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  const ref = useRef<HTMLElement | null>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // On mobile (<md) the rail scrolls horizontally; on md+ it scrolls vertically.
    const horizontal = window.matchMedia('(max-width: 767px)').matches;
    if (horizontal) {
      setCanPrev(el.scrollLeft > 4);
      setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    } else {
      setCanPrev(el.scrollTop > 4);
      setCanNext(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
    }
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    Array.from(el.children).forEach((c) => ro.observe(c));
    window.addEventListener('resize', update);
    return () => { ro.disconnect(); window.removeEventListener('resize', update); };
  }, [update, children]);

  const scroll = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const horizontal = window.matchMedia('(max-width: 767px)').matches;
    const amount = (horizontal ? el.clientWidth : el.clientHeight) * 0.8 * dir;
    if (horizontal) el.scrollBy({ left: amount, behavior: 'smooth' });
    else el.scrollBy({ top: amount, behavior: 'smooth' });
  };

  return (
    <div className="relative md:w-56 lg:w-64 shrink-0 min-h-0">
      <aside
        ref={ref as React.RefObject<HTMLElement>}
        onScroll={update}
        className="h-full flex md:flex-col gap-2 overflow-x-auto md:overflow-x-visible md:overflow-y-auto pb-1 md:pb-0 scroll-smooth"
      >
        {children}
      </aside>
      {canPrev && (
        <IconButton
          tone="overlay"
          size="7"
          onClick={() => scroll(-1)}
          aria-label={t('common.previous')}
          className="absolute z-10 left-1 md:left-1/2 md:-translate-x-1/2 top-1 md:top-1 shadow-lg ring-1 ring-white/15"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline className="md:hidden" points="15 18 9 12 15 6" />
            <polyline className="hidden md:block" points="18 15 12 9 6 15" />
          </svg>
        </IconButton>
      )}
      {canNext && (
        <IconButton
          tone="overlay"
          size="7"
          onClick={() => scroll(1)}
          aria-label={t('common.next')}
          className="absolute z-10 right-1 md:right-auto md:left-1/2 md:-translate-x-1/2 bottom-auto top-1/2 -translate-y-1/2 md:translate-y-0 md:top-auto md:bottom-1 shadow-lg ring-1 ring-white/15"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline className="md:hidden" points="9 18 15 12 9 6" />
            <polyline className="hidden md:block" points="6 9 12 15 18 9" />
          </svg>
        </IconButton>
      )}
    </div>
  );
}

export function CenteredPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-black text-white p-6">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-xl p-6 text-center">
        {children}
      </div>
    </div>
  );
}

export function Spinner() {
  const t = useTranslations();
  return <div className="w-6 h-6 border-2 border-neutral-700 border-t-lc-green rounded-full animate-spin mx-auto" aria-label={t('common.loading')} />;
}
