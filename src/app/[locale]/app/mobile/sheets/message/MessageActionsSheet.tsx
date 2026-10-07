'use client';

import EmojiPicker from '@/components/chat/picker/EmojiPicker';
import { useTranslations } from 'next-intl';
import { useMessageActionsSheet, type MobileActionMessage } from '@/hooks/shell/mobile/sheets/message/useMessageActionsSheet';
import { QUICK_REACTIONS } from '@/services/shell/mobile/message-actions';
import EmojiSheet from './EmojiSheet';

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
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></svg>
            {t('social.reply')}
          </button>
          <button className="ma-action" onClick={vm.copyText}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
            {t('social.copyText')}
          </button>
          <button className="ma-action zap" onClick={onZap}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 3 14h7l-2 8 10-12h-7l2-8z" /></svg>
            {t('mobile.message.zap')}
          </button>
          <button className="ma-action" onClick={vm.copyId}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
            {t('social.copyEventId')}
          </button>
          {vm.canDelete && (
            <button
              className="ma-action danger"
              data-testid="mobile-msg-actions-delete"
              onClick={() => void vm.deleteMessage()}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v5M14 11v5" /></svg>
              {msg.canModerate ? t('mobile.message.deleteEveryone') : t('mobile.message.deleteMessage')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

