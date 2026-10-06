'use client';

import NostrProfile from '@/components/chat/NostrProfile';
import { useTranslations } from 'next-intl';
import { ReaderPaneHeader } from './ReaderPane';
import { ResizablePane } from './ResizablePane';

/**
 * The explored profile beside the main view. It gets the reader's chrome: a
 * header with back and expand, and a fullscreen mode. It was the one pane
 * with no header at all; its only way out was a floating close inside the
 * profile itself, and it could not be widened past the drag handle, which
 * made a feed of notes read in a 520px column.
 */
export function ProfilePane({
  pubkey,
  full,
  storageKey,
  onToggleFull,
  onBack,
  onClose,
  onOpenProfile,
  onMessage,
}: {
  pubkey: string;
  full: boolean;
  storageKey: string;
  onToggleFull: (full: boolean) => void;
  onBack: () => void;
  onClose: () => void;
  onOpenProfile: (pubkey: string) => void;
  onMessage: (peer: string) => void;
}) {
  const t = useTranslations();
  const profile = (
    <NostrProfile
      pubkey={pubkey}
      hideClose
      onClose={onClose}
      onOpenProfile={onOpenProfile}
      onMessage={onMessage}
    />
  );
  if (full) {
    return (
      <div className="obelisk-desktop-bg absolute inset-0 z-40 flex flex-col" data-testid="desktop-profile-pane">
        <ReaderPaneHeader title={t('settings.profile')} full onToggleFull={() => onToggleFull(false)} onBack={onBack} />
        <div className="min-h-0 flex-1">{profile}</div>
      </div>
    );
  }
  return (
    <ResizablePane storageKey={storageKey} defaultWidth={520} min={340} max={900} side="left" rounded={false}>
      <aside
        className="flex h-full min-w-0 flex-1 flex-col overflow-hidden border-l border-lc-border"
        data-testid="desktop-profile-pane"
      >
        <ReaderPaneHeader title={t('settings.profile')} full={false} onToggleFull={() => onToggleFull(true)} onBack={onBack} />
        <div className="min-h-0 flex-1">{profile}</div>
      </aside>
    </ResizablePane>
  );
}
