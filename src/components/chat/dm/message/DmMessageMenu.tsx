'use client';

/**
 * The ⋯ on a DM bubble: copy the text / file link / message id / sender, and
 * "View raw event".
 *
 * A DM's raw event is two events, and the dialog shows both, because the
 * difference between them is the whole privacy story:
 *
 * - **Decrypted message**: the NIP-17 rumor (kind 14 / 15), what only the
 *   two of you can read. Unsigned by design.
 * - **On the relay**: the kind-1059 gift wrap a relay actually stores,
 *   signed by a one-time key. For a legacy NIP-04 message there is only this
 *   one event (kind 4), whose sender and recipient are in the clear.
 *
 * Both come from memory (`JsDirectMessage.raw`); nothing here reads or writes
 * storage.
 */

import { useTranslations } from 'next-intl';
import type { JsDirectMessage } from '@/services/nostr-bridge';
import { useDmMessageMenu } from '@/hooks/chat/dm/message/useDmMessageMenu';
import AnchoredMenu from '@/components/common/AnchoredMenu';
import { MENU_PANEL_CLASS, MenuDivider, MenuItem } from '@/components/ui/overlays/menu';
import { CopyIcon, HashIcon, KeyIcon, LinkIcon, MoreIcon, TerminalIcon } from '@/components/ui/icons/icons';
import { DmRawEventDialog } from './DmRawEventDialog';

export { DmRawEventDialog } from './DmRawEventDialog';

/** Right padding a bubble needs so its text never runs under the ⋯ chip. */
export const DM_BUBBLE_MENU_GUTTER = 'pr-11';

/**
 * Pinned to the bubble's top-right corner (the bubble must be `relative` and
 * leave room on the right: see `DM_BUBBLE_MENU_GUTTER`). A filled chip,
 * dark on the green outgoing bubble and light on the grey incoming one, so it
 * reads as a control on both rather than a faint glyph.
 */
export function DmMessageMenu({ message, className = '' }: { message: JsDirectMessage; className?: string }) {
  const t = useTranslations();
  const {
    close, closeRaw, copyFileLink, copyId, copySender, copyText, open, openRaw, rawOpen, sender, toggle, triggerRef,
  } = useDmMessageMenu(message);
  const tone = message.outgoing
    ? 'bg-black/15 text-black hover:bg-black/30 aria-expanded:bg-black/30'
    : 'bg-white/10 text-lc-white hover:bg-white/20 aria-expanded:bg-white/20';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
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
        onClose={close}
        anchorRef={triggerRef}
        width={220}
        align={message.outgoing ? 'end' : 'start'}
        panelClassName={MENU_PANEL_CLASS}
        testId="dm-message-menu-panel"
      >
        {message.file ? (
          <MenuItem icon={<LinkIcon />} label={t('dm.msg.copyFileLink')} onClick={copyFileLink} testId="dm-msg-copy-file" />
        ) : (
          <MenuItem icon={<CopyIcon />} label={t('dm.msg.copyText')} onClick={copyText} testId="dm-msg-copy-text" />
        )}
        <MenuItem
          icon={<HashIcon />}
          label={t('dm.msg.copyId')}
          onClick={copyId}
          disabled={message.pending || message.failed}
          testId="dm-msg-copy-id"
        />
        {sender && (
          <MenuItem icon={<KeyIcon />} label={t('dm.msg.copySender')} onClick={copySender} testId="dm-msg-copy-sender" />
        )}
        <MenuDivider />
        <MenuItem
          icon={<TerminalIcon />}
          label={t('dm.msg.viewRaw')}
          onClick={openRaw}
          disabled={!message.raw}
          testId="dm-msg-view-raw"
        />
      </AnchoredMenu>
      {rawOpen && <DmRawEventDialog message={message} onClose={closeRaw} />}
    </>
  );
}
