'use client';

import type { ReactNode } from 'react';
import { setDmOptInEnabled, useDmOptInEnabled } from '@/lib/dm/opt-in';
import { useTranslation } from '@/i18n/context';

type Surface = 'desktop' | 'sidebar' | 'mobile';

interface GateProps {
  surface?: Surface;
  secondaryLabel?: string;
  onEnable?: () => void;
  onSecondary?: () => void;
}

interface BoundaryProps extends GateProps {
  children: ReactNode;
}

const COPY_KEYS = [
  'dm.optIn.point.events',
  'dm.optIn.point.subscriptions',
  'dm.optIn.point.device',
] as const;

export function DMOptInBoundary({
  children,
  surface = 'desktop',
  secondaryLabel,
  onEnable,
  onSecondary,
}: BoundaryProps) {
  const enabled = useDmOptInEnabled();
  if (!enabled) {
    return (
      <DMOptInGate
        surface={surface}
        secondaryLabel={secondaryLabel}
        onEnable={onEnable}
        onSecondary={onSecondary}
      />
    );
  }
  return <>{children}</>;
}

export default function DMOptInGate({
  surface = 'desktop',
  secondaryLabel,
  onEnable,
  onSecondary,
}: GateProps) {
  const { t } = useTranslation();
  const compact = surface === 'sidebar';
  const mobile = surface === 'mobile';
  const resolvedSecondaryLabel = secondaryLabel ?? t('dm.optIn.notNow');

  const enable = () => {
    setDmOptInEnabled(true);
    onEnable?.();
  };

  return (
    <div
      className={
        mobile
          ? 'flex min-h-0 flex-1 items-center justify-center px-5 py-6'
          : compact
            ? 'flex h-full w-full items-center justify-center bg-lc-dark p-3'
            : 'flex h-full w-full items-center justify-center bg-lc-black p-6'
      }
      data-testid={`dm-opt-in-gate-${surface}`}
    >
      <section
        className={
          compact
            ? 'w-full rounded-xl border border-lc-border bg-lc-card p-4'
            : 'w-full max-w-md rounded-xl border border-lc-border bg-lc-dark p-6 shadow-2xl'
        }
        aria-labelledby={`dm-opt-in-title-${surface}`}
      >
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-lc-green/40 bg-lc-green/10 text-lc-green">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="11" width="18" height="9" rx="1.5" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <div className="min-w-0">
            <h2 id={`dm-opt-in-title-${surface}`} className={compact ? 'text-sm font-bold text-lc-white' : 'text-lg font-bold text-lc-white'}>
              {t('dm.optIn.title')}
            </h2>
            <p className="mt-1 text-xs text-lc-muted">{t('dm.optIn.subtitle')}</p>
          </div>
        </div>

        <ul className={compact ? 'space-y-2 text-xs text-lc-muted' : 'space-y-2 text-sm text-lc-muted'}>
          {COPY_KEYS.map((key) => (
            <li key={key} className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lc-green" aria-hidden="true" />
              <span>{t(key)}</span>
            </li>
          ))}
        </ul>

        <div className={compact ? 'mt-5 space-y-2' : 'mt-6 flex flex-col gap-2 sm:flex-row'}>
          <button
            type="button"
            onClick={enable}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-lc-green px-4 py-2 text-sm font-bold text-lc-black transition hover:bg-lc-green/90"
            data-testid="enable-dms-button"
          >
            {t('dm.optIn.enable')}
          </button>
          {onSecondary && (
            <button
              type="button"
              onClick={onSecondary}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-lc-border px-4 py-2 text-sm font-semibold text-lc-white transition hover:bg-lc-border/40"
            >
              {resolvedSecondaryLabel}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
