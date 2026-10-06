'use client';

/**
 * The desktop shell's small standalone states: the reconnecting screen, the
 * "pick a channel" empty main pane, the DM subscription anchor and the
 * narrow-viewport voice bar. None of them hold shell state.
 */
import { useDirectMessages } from '@/services/nostr-bridge';
import VoiceStatusBar from '@/components/voice/VoiceStatusBar';
import { useVoiceStore } from '@/store/voice';
import { useTranslations } from 'next-intl';
import type { View } from '@/utils/shell/view';

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

export function EmptyState() {
  const t = useTranslations();
  // Relay/AUTH state lives in the unified bottom-right activity stack.
  // The empty state only owns the channel-selection prompt.
  return (
    <div className="flex h-full items-center justify-center text-lc-muted">
      <div className="text-center">
        <div className="text-lg font-medium text-lc-white">{t('shell.desktop.empty.title')}</div>
        <div className="mt-1 text-sm">{t('shell.desktop.empty.description')}</div>
      </div>
    </div>
  );
}

/** Keeps the DM subscription open for the whole shell, whatever view is up. */
export function DirectMessageSubscriptionAnchor() {
  useDirectMessages();
  return null;
}

/** The voice bar on narrow viewports, hidden while the active call is the open view. */
export function MobileVoiceStatusBar({ currentView }: { currentView: View }) {
  const currentVoiceChannelId = useVoiceStore((s) => s.currentVoiceChannelId);
  const viewingActiveCall =
    currentView.kind === 'group' &&
    !!currentVoiceChannelId &&
    currentView.groupId === currentVoiceChannelId;
  if (viewingActiveCall) return null;
  return <div className="md:hidden"><VoiceStatusBar /></div>;
}
