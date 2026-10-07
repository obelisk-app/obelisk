'use client';

import type { Event as NostrEvent } from 'nostr-tools';
import { useTranslations } from 'next-intl';
import { copyWithToast } from '@/services/common/clipboard';
import { rawEventJson } from '@/services/social/note-links';
import Button from '@/components/ui/buttons/Button';
import Modal from '@/components/ui/overlays/Modal';
import ModalHeader from '@/components/ui/overlays/ModalHeader';

/** A note as it is on the wire: its id, its kind and the signed JSON, with a copy button. */
export default function NoteRawEventModal({ note, onClose }: { note: NostrEvent; onClose: () => void }) {
  const t = useTranslations();
  return (
    <Modal
      onClose={onClose}
      testId="note-raw-modal"
      panelClassName="w-full max-w-2xl mx-4 flex flex-col overflow-hidden rounded-xl bg-lc-dark border border-lc-border shadow-xl"
    >
      <ModalHeader title={t('social.rawEvent')} onClose={onClose}>
        <Button
          variant="pillSecondary"
          size="xs"
          onClick={() => copyWithToast(rawEventJson(note), t('social.rawCopied'))}
          data-testid="note-raw-copy"
        >
          {t('social.copyJson')}
        </Button>
      </ModalHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {/*
          `break-all` because an event is full of 64-character hex strings
          that would otherwise force the dialog wider than the viewport.
        */}
        <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
          <dt className="text-lc-muted">{t('social.eventIdLabel')}</dt>
          <dd className="truncate font-mono text-lc-white" data-testid="note-raw-id">{note.id}</dd>
          <dt className="text-lc-muted">{t('social.kindLabel')}</dt>
          <dd className="font-mono text-lc-white">{note.kind}</dd>
        </dl>
        <pre
          className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-all rounded-lg border border-lc-border bg-lc-black p-3 font-mono text-[11px] leading-relaxed text-lc-muted"
          data-testid="note-raw-json"
        >
          {rawEventJson(note)}
        </pre>
      </div>
    </Modal>
  );
}
