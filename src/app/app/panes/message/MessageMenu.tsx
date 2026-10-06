'use client';

import type { JsMessage } from '@/services/nostr-bridge';
import {
  BellOffIcon,
  ChevronRightIcon,
  CopyIcon,
  ForwardIcon,
  LinkIcon,
  ReplyIcon,
  SmileIcon,
  TrashIcon,
  ZapIcon,
} from '@/components/ui/icons';
import { MENU_PANEL_CLASS, MenuDivider, MenuItem } from '@/components/ui/menu';
import FloatingPanel from '@/components/ui/FloatingPanel';
import { useTranslation } from '@/i18n/context';
import type { MessageRowActions } from './useMessageRowActions';
import type { MessageRowMenus } from './useMessageRowMenus';
import RemoteImage from '@/components/ui/RemoteImage';

/** The ⋯ menu: four quick reactions, then reply / forward / zap / copy / mute / delete. */
export function MessageMenu({ msg, actions, menus, isAdmin, onReply }: {
  msg: JsMessage;
  actions: MessageRowActions;
  menus: MessageRowMenus;
  isAdmin: boolean;
  onReply: (m: JsMessage) => void;
}) {
  const { t } = useTranslation();
  const close = () => menus.setMenuOpen(false);
  return (
    <FloatingPanel anchorRef={menus.moreBtnRef} panelRef={menus.menuPanelRef} onClose={close}>
      <div
        role="menu"
        className={`w-64 ${MENU_PANEL_CLASS}`}
        data-testid="message-menu"
      >
        <div className="mb-1 grid grid-cols-4 gap-1.5 p-0.5">
          {actions.quick4.map((e) => {
            const mine = actions.myReactedEmojis.has(e.char);
            return (
              <button
                key={e.char}
                type="button"
                onClick={() => { actions.reactWith(e); menus.closeAll(); }}
                disabled={mine}
                className="flex h-11 items-center justify-center rounded-lg bg-lc-card text-xl transition-colors hover:bg-lc-green/15 disabled:cursor-default disabled:opacity-40"
                title={mine ? t('desktop.reactions.alreadyReacted') : t('desktop.reactions.reactEmoji').replace('{emoji}', e.char)}
                data-testid="message-menu-quick-reaction"
              >
                {e.url ? <RemoteImage src={e.url} alt={e.char} className="h-6 w-6 object-contain" /> : e.char}
              </button>
            );
          })}
        </div>
        <MenuItem
          icon={<SmileIcon />}
          label={t('desktop.reactions.addReaction')}
          trailing={<ChevronRightIcon size={14} />}
          onClick={menus.openPicker}
          testId="message-menu-add-reaction"
        />
        <MenuDivider />
        <MenuItem icon={<ReplyIcon />} label={t('desktop.message.reply')} onClick={() => { onReply(msg); close(); }} testId="message-menu-reply" />
        <MenuItem icon={<ForwardIcon />} label={t('message.forward')} onClick={() => { menus.setForwarding(true); close(); }} testId="message-menu-forward" />
        <MenuItem
          icon={<ZapIcon />}
          label={t('desktop.message.zap')}
          disabled={actions.isOwn}
          onClick={() => { actions.onZapClick(); close(); }}
          testId="message-menu-zap"
        />
        <MenuDivider />
        <MenuItem
          icon={<CopyIcon />}
          label={t('desktop.message.copyText')}
          onClick={() => { actions.copyText(); close(); }}
          testId="message-menu-copy-text"
        />
        <MenuItem
          icon={<LinkIcon />}
          label={t('desktop.message.copyLink')}
          onClick={() => { actions.copyLink(); close(); }}
          testId="message-menu-copy-link"
        />
        <MenuDivider />
        <MenuItem
          icon={<BellOffIcon />}
          label={actions.isMuted ? t('desktop.message.unmuteUser') : t('desktop.message.muteUser')}
          disabled={actions.isOwn}
          onClick={() => { void actions.toggleMute(); close(); }}
          testId="message-menu-mute"
        />
        {actions.canDelete && (
          <MenuItem
            icon={<TrashIcon />}
            danger
            label={isAdmin ? t('desktop.message.deleteEveryone') : t('desktop.message.deleteMessage')}
            onClick={() => { void actions.deleteMessage(); close(); }}
            testId="message-menu-delete"
          />
        )}
      </div>
    </FloatingPanel>
  );
}
