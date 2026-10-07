'use client';

import type { ReactNode } from 'react';
import Modal from '@/components/ui/overlays/Modal';

/** The library inside a modal, or bare when a settings screen embeds it. */
export default function MediaLibraryShell({ embedded, onClose, closeOnEscape, children }: {
  embedded: boolean;
  onClose: () => void;
  closeOnEscape: boolean;
  children: ReactNode;
}) {
  if (embedded) {
    return <div data-testid="media-library-embedded" className="flex h-full min-h-0 w-full overflow-hidden bg-lc-dark">{children}</div>;
  }
  return (
    <Modal
      onClose={onClose}
      closeOnEscape={closeOnEscape}
      testId="media-library-modal"
      panelClassName="lc-card mx-2 flex h-[calc(100dvh_-_1rem)] max-h-[calc(100%_-_1rem)] w-full max-w-6xl overflow-hidden bg-lc-dark sm:mx-3 sm:h-[min(780px,94vh)] sm:max-h-none"
    >
      {children}
    </Modal>
  );
}
