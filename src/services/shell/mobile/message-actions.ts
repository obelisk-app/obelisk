/**
 * What the phone message-actions sheet does to the page around it. The sheet
 * is mounted at the PhoneShell level, so a reaction or a reply reaches the
 * channel through a window event (`obelisk-mobile:react`, picked up by
 * `useMobileReactionSender`; `obelisk-mobile:reply`, by `useReplyTarget`).
 */
import type { PickedCustomEmoji } from '@/utils/chat/picker/picker-types';
import { REACT_EVENT, REPLY_EVENT } from '@/constants/shell/mobile';

/** Ask the shell to react to `msg` with `emoji` (a custom one carries its image). */
export function emitMobileReaction(msg: object, emoji: string, custom?: PickedCustomEmoji): void {
  try {
    window.dispatchEvent(new CustomEvent(REACT_EVENT, {
      detail: {
        msg,
        emoji,
        customEmojis: custom ? { [custom.name]: custom.url } : undefined,
      },
    }));
  } catch { /* ignore */ }
}

/** Ask the open channel to reply to the message with this id. */
export function requestMobileReply(msgId: string): void {
  try {
    window.dispatchEvent(new CustomEvent(REPLY_EVENT, { detail: { msgId } }));
  } catch { /* ignore */ }
}

/** Copy without waiting or failing: a refused or missing clipboard is not the sheet's problem. */
export function copyQuietly(text: string): void {
  try {
    void Promise.resolve(navigator.clipboard?.writeText(text)).catch(() => {});
  } catch { /* ignore */ }
}
