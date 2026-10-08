'use client';

import Button from '@/components/ui/buttons/Button';
import EmojiPicker from '@/components/chat/picker/EmojiPicker';
import { useTranslations } from 'next-intl';
import { useMessageActionsSheet, type MobileActionMessage } from '@/hooks/shell/mobile/sheets/message/useMessageActionsSheet';
import { QUICK_REACTIONS } from '@/constants/shell/mobile';
import EmojiSheet from './EmojiSheet';
import { ZapIcon, CopyIcon, ReplyIcon, TrashIcon } from '@/assets/icons';

export function MessageActionsSheet({
  msg,
  close,
  onZap,
}: {
  msg: MobileActionMessage;
  close: () => void;
  onZap: () => void;
}) {
  const t = useTranslations();
  const vm = useMessageActionsSheet(msg, close);

  return (
    <div className="sheet-host" data-screen="msg-actions">
      <div className="ma-context">
        <div className="ma-context-msg">
          <div className="ma-context-msg-name">{vm.name}</div>
          <div className="ma-context-msg-text">{msg.content}</div>
        </div>
      </div>
      <div className="sheet-backdrop" onClick={close} />
      <div className="sheet native-scroll-y">
        <div className="sheet-handle" />
        <div className="ma-quick-reactions">
          {QUICK_REACTIONS.map((e) => (
            <Button variant="bare" key={e} className="ma-quick-react" onClick={() => vm.quickReact(e)}>{e}</Button>
          ))}
        </div>
        {vm.pickerOpen && (
          <EmojiSheet onClose={vm.closePicker}>
            <EmojiPicker
              variant="sheet"
              onPick={vm.pickReaction}
              onClose={vm.closePicker}
            />
          </EmojiSheet>
        )}
        <div className="ma-action-list native-scroll-y">
          <Button
            variant="bare"
            className="ma-action"
            data-testid="mobile-msg-actions-reply"
            onClick={vm.reply}
          >
            <ReplyIcon size={null} />
            {t('social.reply')}
          </Button>
          <Button variant="bare" className="ma-action" onClick={vm.copyText}>
            <CopyIcon size={null} />
            {t('social.copyText')}
          </Button>
          <Button variant="bare" className="ma-action zap" onClick={onZap}>
            <ZapIcon size={null} />
            {t('mobile.message.zap')}
          </Button>
          <Button variant="bare" className="ma-action" onClick={vm.copyId}>
            <CopyIcon size={null} />
            {t('social.copyEventId')}
          </Button>
          {vm.canDelete && (
            <Button
              variant="bare"
              className="ma-action danger"
              data-testid="mobile-msg-actions-delete"
              onClick={() => void vm.deleteMessage()}
            >
              <TrashIcon size={null} />
              {msg.canModerate ? t('mobile.message.deleteEveryone') : t('mobile.message.deleteMessage')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

