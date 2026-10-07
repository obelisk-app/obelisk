'use client';

import EmojiPicker from '@/components/chat/picker/EmojiPicker';
import { useTranslations } from 'next-intl';
import { useMessageActionsSheet, type MobileActionMessage } from '@/hooks/shell/mobile/sheets/message/useMessageActionsSheet';
import { QUICK_REACTIONS } from '@/services/shell/mobile/message-actions';
import EmojiSheet from './EmojiSheet';
import { BoltAltIcon, CopyLargeIcon, CornerUpLeftIcon, TrashFlatIcon } from '@/assets/icons';

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
            <button key={e} className="ma-quick-react" onClick={() => vm.quickReact(e)}>{e}</button>
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
          <button
            className="ma-action"
            data-testid="mobile-msg-actions-reply"
            onClick={vm.reply}
          >
            <CornerUpLeftIcon size={null} />
            {t('social.reply')}
          </button>
          <button className="ma-action" onClick={vm.copyText}>
            <CopyLargeIcon size={null} />
            {t('social.copyText')}
          </button>
          <button className="ma-action zap" onClick={onZap}>
            <BoltAltIcon size={null} />
            {t('mobile.message.zap')}
          </button>
          <button className="ma-action" onClick={vm.copyId}>
            <CopyLargeIcon size={null} />
            {t('social.copyEventId')}
          </button>
          {vm.canDelete && (
            <button
              className="ma-action danger"
              data-testid="mobile-msg-actions-delete"
              onClick={() => void vm.deleteMessage()}
            >
              <TrashFlatIcon size={null} />
              {msg.canModerate ? t('mobile.message.deleteEveryone') : t('mobile.message.deleteMessage')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

