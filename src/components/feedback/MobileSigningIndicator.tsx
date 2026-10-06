'use client';

import { useState } from 'react';
import { type ActivityEntry } from '@/services/activity-log';
import { useActivityLog } from '@/hooks/useActivityLog';
import { useTranslations } from 'next-intl';
import CloseButton from '@/components/ui/CloseButton';
import Overlay from '@/components/ui/Overlay';
import type { MessageKey } from '@/i18n/keys';

export default function MobileSigningIndicator() {
  const t = useTranslations();
  const activities = useActivityLog();
  const [open, setOpen] = useState(false);
  const signing = activities.find((entry) => entry.operation === 'sign' && entry.status === 'pending')
    ?? activities.find((entry) => entry.operation === 'sign')
    ?? null;
  const status = signing?.status ?? 'idle';
  const color = status === 'pending'
    ? 'bg-amber-400 animate-pulse'
    : status === 'ok'
      ? 'bg-lc-green'
      : status === 'error'
        ? 'bg-red-500'
        : 'bg-lc-green';

  return (
    <>
      <button
        type="button"
        className="icon-btn action-sign"
        onClick={() => setOpen(true)}
        aria-label={t('mobile.signing.label')}
        data-testid="mobile-signing-indicator"
        data-status={status}
      >
        <span className={`h-3.5 w-3.5 rounded-full border-2 border-black/40 shadow-[0_0_8px_currentColor] ${color}`} aria-hidden="true" />
      </button>
      {open && <SigningPopup entry={signing} onClose={() => setOpen(false)} />}
    </>
  );
}

function SigningPopup({ entry, onClose }: { entry: ActivityEntry | null; onClose: () => void }) {
  const t = useTranslations();

  const statusKey: MessageKey = entry ? `mobile.signing.${entry.status}` : 'mobile.signing.idle';
  const kind = entry?.eventKind == null ? null : `kind ${entry.eventKind}`;
  const detail = [entry?.description, kind].filter(Boolean).join(' · ') || entry?.detail;

  return (
    // Overlay owns the backdrop click and Escape. Not portalled: the popup
    // sits at z-[160] over the phone shell exactly where it is mounted.
    <Overlay
      onClose={onClose}
      backdropClassName="fixed inset-0 z-[160] flex items-center justify-center bg-black/70 p-5"
      portal={false}
      testId="mobile-signing-popup-backdrop"
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-lc-border bg-lc-dark p-4 text-lc-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-signing-title"
        onClick={(event) => event.stopPropagation()}
        data-testid="mobile-signing-popup"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="mobile-signing-title" className="text-base font-semibold">{t('mobile.signing.title')}</h2>
            <p className="mt-1 text-xs text-lc-green">{t(statusKey)}</p>
          </div>
          <CloseButton onClick={onClose} />
        </div>
        {entry ? (
          <div className="mt-4 rounded-xl border border-lc-border bg-lc-black p-3">
            <div className="text-sm font-medium">{entry.label}</div>
            {detail && <div className="mt-1 break-words text-xs text-lc-muted">{detail}</div>}
          </div>
        ) : (
          <p className="mt-4 text-sm text-lc-muted">{t('mobile.signing.none')}</p>
        )}
      </div>
    </Overlay>
  );
}
