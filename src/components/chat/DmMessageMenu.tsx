'use client';

/**
 * The ⋯ on a DM bubble: copy the text / file link / message id / sender, and
 * "View raw event".
 *
 * A DM's raw event is two events, and the dialog shows both, because the
 * difference between them is the whole privacy story:
 *
 * - **Decrypted message** — the NIP-17 rumor (kind 14 / 15), what only the
 *   two of you can read. Unsigned by design.
 * - **On the relay** — the kind-1059 gift wrap a relay actually stores,
 *   signed by a one-time key. For a legacy NIP-04 message there is only this
 *   one event (kind 4), whose sender and recipient are in the clear.
 *
 * Both come from memory (`JsDirectMessage.raw`); nothing here reads or writes
 * storage.
 */

import { useRef, useState } from 'react';
import { hexToNpub } from '@nostr-wot/data';
import { useTranslation } from '@/i18n/context';
import { useMyPubkey } from '@/lib/nostr-bridge';
import type { DmRawEvent, JsDirectMessage } from '@/lib/nostr-bridge/types';
import AnchoredMenu from '@/components/social/AnchoredMenu';
import ModalShell from '@/components/ModalShell';
import { MENU_PANEL_CLASS, MenuDivider, MenuItem } from '@/components/ui/menu';
import { CopyIcon, HashIcon, KeyIcon, LinkIcon, LockIcon, MoreIcon, TerminalIcon } from '@/components/ui/icons';
import { useToastStore } from '@/store/toast';

function safeNpub(pubkey: string): string {
  try {
    return hexToNpub(pubkey);
  } catch {
    return pubkey;
  }
}

function copy(value: string, message: string) {
  // `Promise.resolve`: a clipboard shim may return undefined.
  void Promise.resolve(navigator.clipboard?.writeText(value)).catch(() => {});
  useToastStore.getState().pushToast({ title: message, body: '' });
}

const json = (ev: DmRawEvent) => JSON.stringify(ev, null, 2);

/** Right padding a bubble needs so its text never runs under the ⋯ chip. */
export const DM_BUBBLE_MENU_GUTTER = 'pr-11';

function RawEventView({ event, hint, warning, testId }: { event: DmRawEvent; hint: string; warning?: string | null; testId: string }) {
  const { t } = useTranslation();
  return (
    <div data-testid={testId}>
      <p className="mb-2 text-xs text-lc-muted">{hint}</p>
      {warning && (
        <p className="mb-2 flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-300" role="note">
          <LockIcon size={13} className="mt-0.5 shrink-0" />
          {warning}
        </p>
      )}
      <dl className="mb-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
        <dt className="text-lc-muted">{t('social.eventIdLabel')}</dt>
        <dd className="truncate font-mono text-lc-white">{event.id}</dd>
        <dt className="text-lc-muted">{t('social.kindLabel')}</dt>
        <dd className="font-mono text-lc-white">{event.kind}</dd>
      </dl>
      {/* `break-all`: an event is full of 64-char hex strings. */}
      <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap break-all rounded-lg border border-lc-border bg-lc-black p-3 font-mono text-[11px] leading-relaxed text-lc-white/80">
        {json(event)}
      </pre>
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          className="lc-pill-secondary px-3 py-1.5 text-xs"
          onClick={() => copy(json(event), t('dm.msg.copied'))}
          data-testid={`${testId}-copy`}
        >
          {t('social.copyJson')}
        </button>
      </div>
    </div>
  );
}

export function DmRawEventDialog({ message, onClose }: { message: JsDirectMessage; onClose: () => void }) {
  const { t } = useTranslation();
  const rumor = message.raw?.rumor;
  const wire = message.raw?.wire;
  const [tab, setTab] = useState<'message' | 'wire'>(rumor ? 'message' : 'wire');
  const holdsKey = Boolean(rumor?.tags.some((tag) => tag[0] === 'decryption-key'));
  const nip04 = message.protocol === 'nip04' || wire?.kind === 4;

  return (
    <ModalShell
      onClose={onClose}
      testId="dm-raw-modal"
      panelClassName="w-full max-w-2xl mx-4 rounded-xl bg-lc-dark border border-lc-border p-5 shadow-xl"
    >
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-sm font-semibold text-lc-white">{t('dm.raw.title')}</h2>
        {rumor && wire && (
          <div className="ml-auto flex gap-1 rounded-lg bg-lc-black/40 p-1" role="tablist">
            {(['message', 'wire'] as const).map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${tab === id ? 'bg-lc-green/15 text-lc-green' : 'text-lc-white hover:bg-white/5'}`}
                data-testid={`dm-raw-tab-${id}`}
              >
                {id === 'message' ? t('dm.raw.tabMessage') : t('dm.raw.tabWire')}
              </button>
            ))}
          </div>
        )}
      </div>
      {!rumor && !wire && <p className="text-xs text-lc-muted">{t('dm.raw.unavailable')}</p>}
      {rumor && tab === 'message' && (
        <RawEventView
          event={rumor}
          hint={t('dm.raw.rumorHint').replace('{kind}', String(rumor.kind))}
          warning={holdsKey ? t('dm.raw.keyWarning') : null}
          testId="dm-raw-rumor"
        />
      )}
      {wire && (tab === 'wire' || !rumor) && (
        <>
          <RawEventView event={wire} hint={nip04 ? t('dm.raw.nip04Hint') : t('dm.raw.wrapHint')} testId="dm-raw-wire" />
          {nip04 && (
            <div className="mt-3">
              <p className="mb-1 text-[11px] text-lc-muted">{t('dm.raw.decrypted')}</p>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-lc-border bg-lc-black p-3 text-xs text-lc-white">
                {message.content}
              </pre>
            </div>
          )}
        </>
      )}
    </ModalShell>
  );
}

/**
 * Pinned to the bubble's top-right corner (the bubble must be `relative` and
 * leave room on the right — see `DM_BUBBLE_MENU_GUTTER`). A filled chip,
 * dark on the green outgoing bubble and light on the grey incoming one, so it
 * reads as a control on both rather than a faint glyph.
 */
export function DmMessageMenu({ message, className = '' }: { message: JsDirectMessage; className?: string }) {
  const { t } = useTranslation();
  const me = useMyPubkey();
  const [open, setOpen] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const sender = message.outgoing ? me : message.counterparty;
  const done = (fn: () => void) => () => { fn(); setOpen(false); };
  const tone = message.outgoing
    ? 'bg-black/15 text-black hover:bg-black/30 aria-expanded:bg-black/30'
    : 'bg-white/10 text-lc-white hover:bg-white/20 aria-expanded:bg-white/20';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lc-green ${tone} ${className}`}
        aria-label={t('dm.msg.options')}
        title={t('dm.msg.options')}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="dm-message-menu"
      >
        <MoreIcon size={18} />
      </button>
      <AnchoredMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        width={220}
        align={message.outgoing ? 'end' : 'start'}
        panelClassName={MENU_PANEL_CLASS}
        testId="dm-message-menu-panel"
      >
        {message.file ? (
          <MenuItem icon={<LinkIcon />} label={t('dm.msg.copyFileLink')} onClick={done(() => copy(message.file!.url, t('dm.msg.copied')))} testId="dm-msg-copy-file" />
        ) : (
          <MenuItem icon={<CopyIcon />} label={t('dm.msg.copyText')} onClick={done(() => copy(message.content, t('dm.msg.copied')))} testId="dm-msg-copy-text" />
        )}
        <MenuItem
          icon={<HashIcon />}
          label={t('dm.msg.copyId')}
          onClick={done(() => copy(message.id, t('dm.msg.copied')))}
          disabled={message.pending || message.failed}
          testId="dm-msg-copy-id"
        />
        {sender && (
          <MenuItem icon={<KeyIcon />} label={t('dm.msg.copySender')} onClick={done(() => copy(safeNpub(sender), t('dm.msg.copied')))} testId="dm-msg-copy-sender" />
        )}
        <MenuDivider />
        <MenuItem
          icon={<TerminalIcon />}
          label={t('dm.msg.viewRaw')}
          onClick={done(() => setRawOpen(true))}
          disabled={!message.raw}
          testId="dm-msg-view-raw"
        />
      </AnchoredMenu>
      {rawOpen && <DmRawEventDialog message={message} onClose={() => setRawOpen(false)} />}
    </>
  );
}
