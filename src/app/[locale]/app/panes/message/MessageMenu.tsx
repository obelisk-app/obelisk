'use client';

import Button from '@/components/ui/buttons/Button';
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
} from '@/assets/icons';
import { MENU_PANEL_CLASS, MenuDivider, MenuItem } from '@/components/ui/overlays/menu';
import FloatingPanel from '@/components/ui/overlays/FloatingPanel';
import { useTranslations } from 'next-intl';
import type { MessageRowActions } from '@/hooks/shell/panes/message/useMessageRowActions';
import type { MessageRowMenus } from '@/hooks/shell/panes/message/useMessageRowMenus';
import RemoteImage from '@/components/ui/media/RemoteImage';
import { useMessageMenu } from '@/hooks/shell/panes/message/useMessageMenu';

/** The ⋯ menu: four quick reactions, then reply / forward / zap / copy / mute / delete. */
export function MessageMenu({ msg, actions, menus, isAdmin, onReply }: {
  msg: JsMessage;
  actions: MessageRowActions;
  menus: MessageRowMenus;
  isAdmin: boolean;
  onReply: (m: JsMessage) => void;
}) {
  const t = useTranslations();
  const vm = useMessageMenu({ msg, actions, menus, onReply });
  return (
    <FloatingPanel anchorRef={menus.moreBtnRef} panelRef={menus.menuPanelRef} onClose={vm.close}>
      <div
        role="menu"
        className={`w-64 ${MENU_PANEL_CLASS}`}
        data-testid="message-menu"
      >
        <div className="mb-1 grid grid-cols-4 gap-1.5 p-0.5">
          {vm.slots.map(({ emoji: e, mine }) => (
            <Button
              variant="bare"
              key={e.char}
              type="button"
              onClick={() => vm.react(e)}
              disabled={mine}
              className="flex h-11 items-center justify-center rounded-lg bg-lc-card text-xl transition-colors hover:bg-lc-green/15 disabled:cursor-default disabled:opacity-40"
              title={mine ? t('shell.desktop.reactions.alreadyReacted') : t('shell.desktop.reactions.reactEmoji', { emoji: e.char })}
              data-testid="message-menu-quick-reaction"
            >
              {e.url ? <RemoteImage src={e.url} alt={e.char} className="h-6 w-6 object-contain" /> : e.char}
            </Button>
          ))}
        </div>
        <MenuItem
          icon={<SmileIcon />}
          label={t('shell.desktop.reactions.addReaction')}
          trailing={<ChevronRightIcon size={14} />}
          onClick={menus.openPicker}
          testId="message-menu-add-reaction"
        />
        <MenuDivider />
        <MenuItem icon={<ReplyIcon />} label={t('shell.desktop.message.reply')} onClick={vm.reply} testId="message-menu-reply" />
        <MenuItem icon={<ForwardIcon />} label={t('chat.message.forward')} onClick={vm.forward} testId="message-menu-forward" />
        <MenuItem
          icon={<ZapIcon />}
          label={t('shell.desktop.message.zap')}
          disabled={actions.isOwn}
          onClick={vm.zap}
          testId="message-menu-zap"
        />
        <MenuDivider />
        <MenuItem
          icon={<CopyIcon />}
          label={t('shell.desktop.message.copyText')}
          onClick={vm.copyText}
          testId="message-menu-copy-text"
        />
        <MenuItem
          icon={<LinkIcon />}
          label={t('shell.desktop.message.copyLink')}
          onClick={vm.copyLink}
          testId="message-menu-copy-link"
        />
        <MenuDivider />
        <MenuItem
          icon={<BellOffIcon />}
          label={actions.isMuted ? t('shell.desktop.message.unmuteUser') : t('shell.desktop.message.muteUser')}
          disabled={actions.isOwn}
          onClick={vm.toggleMute}
          testId="message-menu-mute"
        />
        {actions.canDelete && (
          <MenuItem
            icon={<TrashIcon />}
            danger
            label={isAdmin ? t('shell.desktop.message.deleteEveryone') : t('shell.desktop.message.deleteMessage')}
            onClick={vm.deleteMessage}
            testId="message-menu-delete"
          />
        )}
      </div>
    </FloatingPanel>
  );
}
