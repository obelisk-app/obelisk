'use client';

import { useRef, useState, type RefObject } from 'react';
import { useTranslations } from 'next-intl';
import FileInput from '@/components/ui/FileInput';
import { useDismiss } from '@/hooks/useDismiss';
import { MenuIcon, type MenuIconKind } from './composer-icons';
import IconButton from '@/components/ui/IconButton';

function MenuItem({ label, icon, onClick, disabled }: { label: string; icon: MenuIconKind; onClick?: () => void; disabled?: boolean }) {
  const t = useTranslations();
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-35"
    >
      <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-lc-green/15 text-lc-green">
        <MenuIcon kind={icon} />
      </span>
      <span>{label}</span>
      {disabled && <span className="ml-auto text-[10px] uppercase tracking-wide text-lc-muted">{t('chat.composer.later')}</span>}
    </button>
  );
}

/** One hidden picker per menu entry; a pick hands every chosen file over and resets the input. */
function PickerInput({
  inputRef,
  label,
  accept,
  capture,
  onFiles,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  label: string;
  accept?: string;
  capture?: 'environment';
  onFiles: (files: File[]) => void;
}) {
  return (
    <FileInput
      ref={inputRef}
      accept={accept}
      capture={capture}
      multiple={!capture}
      aria-label={label}
      onChange={(event) => {
        const files = Array.from(event.target.files ?? []);
        if (files.length) onFiles(files);
        event.target.value = '';
      }}
    />
  );
}

/** Ask for an npub or hex key with `question`; the trimmed answer, or null when cancelled or blank. */
export function promptForContact(question: string): string | null {
  const value = window.prompt(question);
  return value?.trim() ? value.trim() : null;
}

export function AttachmentMenu({
  disabled,
  onFiles,
  onContact,
  onNewSticker,
}: {
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  onContact: (value: string) => void;
  onNewSticker: () => void;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<HTMLInputElement>(null);
  const documentRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  useDismiss({ refs: [rootRef], onDismiss: () => setOpen(false), enabled: open, escape: 'ignore' });

  const pick = (ref: RefObject<HTMLInputElement | null>) => {
    setOpen(false);
    ref.current?.click();
  };
  const contact = () => {
    setOpen(false);
    const value = promptForContact(t('chat.composer.contactPrompt'));
    if (value) onContact(value);
  };

  return (
    <div ref={rootRef} className="relative">
      <PickerInput inputRef={mediaRef} label={t('chat.composer.photos')} accept="image/*,video/*" onFiles={onFiles} />
      <PickerInput inputRef={documentRef} label={t('chat.composer.document')} onFiles={onFiles} />
      <PickerInput inputRef={cameraRef} label={t('chat.composer.camera')} accept="image/*" capture="environment" onFiles={onFiles} />
      <IconButton
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        aria-label={t('chat.composer.addAttachment')}
        aria-expanded={open}
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
      </IconButton>
      {open && (
        <div className="absolute bottom-full left-0 z-40 mb-2 w-56 overflow-hidden rounded-2xl border border-lc-border bg-lc-dark p-2 text-sm text-lc-white shadow-2xl" role="menu">
          <MenuItem label={t('chat.composer.document')} icon="document" onClick={() => pick(documentRef)} />
          <MenuItem label={t('chat.composer.photos')} icon="media" onClick={() => pick(mediaRef)} />
          <MenuItem label={t('chat.composer.camera')} icon="camera" onClick={() => pick(cameraRef)} />
          <MenuItem label={t('chat.composer.contact')} icon="contact" onClick={contact} />
          <MenuItem label={t('chat.composer.newSticker')} icon="sticker" onClick={() => { setOpen(false); onNewSticker(); }} />
          <MenuItem label={t('chat.composer.poll')} icon="poll" disabled />
          <MenuItem label={t('chat.composer.event')} icon="event" disabled />
        </div>
      )}
    </div>
  );
}
