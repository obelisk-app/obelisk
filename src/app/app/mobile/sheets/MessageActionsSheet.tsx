'use client';

import { displayNameFor } from '@/utils/identity/display-name';
import { useState } from 'react';
import { useUserMetadata } from '@/services/nostr-bridge';
import EmojiPicker, { type PickedCustomEmoji } from '@/components/chat/EmojiPicker';
import { moderationLabelsFrom, useMessageModeration } from '@/hooks/chat/useMessageActions';
import { useTranslation } from '@/i18n/context';
import EmojiSheet from '../EmojiSheet';

export function MessageActionsSheet({
  msg,
  close,
  onZap,
}: {
  msg: {
    id: string;
    pubkey: string;
    content: string;
    groupId?: string;
    canModerate?: boolean;
    canDeleteOwn?: boolean;
  };
  close: () => void;
  onZap: () => void;
}) {
  const { t } = useTranslation();
  const meta = useUserMetadata(msg.pubkey);
  const name = displayNameFor(msg.pubkey, meta);
  const [pickerOpen, setPickerOpen] = useState(false);
  const { canDelete: canDeleteMessage, deleteMessage: confirmAndDelete } = useMessageModeration(
    msg, msg.groupId, !!msg.canModerate, !!msg.canDeleteOwn, moderationLabelsFrom(t),
  );
  const deleteMessage = async () => {
    if (await confirmAndDelete()) close();
  };
  const emitReaction = (emoji: string, custom?: PickedCustomEmoji) => {
    try {
      window.dispatchEvent(new CustomEvent('obelisk-mobile:react', {
        detail: {
          msg,
          emoji,
          customEmojis: custom ? { [custom.name]: custom.url } : undefined,
        },
      }));
    } catch { /* ignore */ }
  };

  return (
    <div className="sheet-host" data-screen="msg-actions">
      <div className="ma-context">
        <div className="ma-context-msg">
          <div className="ma-context-msg-name">{name}</div>
          <div className="ma-context-msg-text">{msg.content}</div>
        </div>
      </div>
      <div className="sheet-backdrop" onClick={close} />
      <div className="sheet native-scroll-y">
        <div className="sheet-handle" />
        <div className="ma-quick-reactions">
          {['👍', '❤️', '🚀', '🔥', '👀', '+'].map((e) => (
            <button key={e} className="ma-quick-react" onClick={() => {
              if (e === '+') {
                setPickerOpen(true);
                return;
              }
              emitReaction(e);
              close();
            }}>{e}</button>
          ))}
        </div>
        {pickerOpen && (
          <EmojiSheet onClose={() => setPickerOpen(false)}>
            <EmojiPicker
              variant="sheet"
              onPick={(emoji, custom) => {
                emitReaction(emoji, custom);
                close();
              }}
              onClose={() => setPickerOpen(false)}
            />
          </EmojiSheet>
        )}
        <div className="ma-action-list native-scroll-y">
          <button
            className="ma-action"
            data-testid="mobile-msg-actions-reply"
            onClick={() => {
              try {
                window.dispatchEvent(
                  new CustomEvent('obelisk-mobile:reply', { detail: { msgId: msg.id } }),
                );
              } catch { /* ignore */ }
              close();
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></svg>
            {t('social.reply')}
          </button>
          <button className="ma-action" onClick={() => { try { navigator.clipboard?.writeText(msg.content); } catch { /* ignore */ } close(); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
            {t('social.copyText')}
          </button>
          <button className="ma-action zap" onClick={onZap}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 3 14h7l-2 8 10-12h-7l2-8z" /></svg>
            {t('mobile.message.zap')}
          </button>
          <button className="ma-action" onClick={() => { try { navigator.clipboard?.writeText(msg.id); } catch { /* ignore */ } close(); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
            {t('social.copyEventId')}
          </button>
          {canDeleteMessage && (
            <button
              className="ma-action danger"
              data-testid="mobile-msg-actions-delete"
              onClick={() => { void deleteMessage(); }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v5M14 11v5" /></svg>
              {msg.canModerate ? 'Delete for everyone' : 'Delete message'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 15 - zap modal sheet
