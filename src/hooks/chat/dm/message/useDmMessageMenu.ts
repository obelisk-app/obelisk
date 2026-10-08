'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { type JsDirectMessage } from '@/services/nostr-bridge';
import { useMyPubkey } from '@/hooks/session/useSession';
import { copyWithToast } from '@/services/common/clipboard';
import { safeNpub } from '@/utils/identity/short-npub';

/**
 * The ⋯ menu on a DM bubble: open or closed, the raw-event dialog, and the
 * copy actions. Every menu action closes the menu after it runs.
 */
export function useDmMessageMenu(message: JsDirectMessage) {
  const t = useTranslations();
  const me = useMyPubkey();
  const [open, setOpen] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const sender = message.outgoing ? me : message.counterparty;
  const thenClose = (fn: () => void) => {
    fn();
    setOpen(false);
  };
  const copy = (value: string) => thenClose(() => copyWithToast(value, t('dm.msg.copied')));

  return {
    open,
    rawOpen,
    triggerRef,
    /** Whose key "Copy sender" copies: me on an outgoing message, else the other person. */
    sender,
    toggle: () => setOpen((v) => !v),
    close: () => setOpen(false),
    copyFileLink: () => copy(message.file?.url ?? ''),
    copyText: () => copy(message.content),
    copyId: () => copy(message.id),
    copySender: () => copy(sender ? safeNpub(sender) : ''),
    openRaw: () => thenClose(() => setRawOpen(true)),
    closeRaw: () => setRawOpen(false),
  };
}
