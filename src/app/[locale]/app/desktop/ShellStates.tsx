'use client';

/**
 * The reconnecting screen. The desktop shell's other small standalone
 * states sit beside it, one per file: `EmptyState`,
 * `DirectMessageSubscriptionAnchor` and `MobileVoiceStatusBar`.
 */
import { useTranslations } from 'next-intl';

export function RehydratingScreen() {
  const t = useTranslations();
  return (
    <div
      className="appearance-bg lc-grid-bg fixed inset-0 z-50 flex items-center justify-center bg-lc-black p-4"
      data-testid="rehydrating-screen"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-4">
        <div className="lc-spinner" />
        <div className="text-sm text-lc-muted">{t('common.reconnecting')}</div>
      </div>
    </div>
  );
}
