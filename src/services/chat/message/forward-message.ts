import { nostrActions, type JsGroup, type JsMessage } from '@/services/nostr-bridge';
import { useToastStore } from '@/store/feedback/toast';
import { errorReason } from '@/utils/errors/error-text';
import { forwardedContent } from '@/utils/chat/message/forward';
import type { Translate } from '@/i18n/keys';

/**
 * Forward `message` into `target` as a new kind 9 carrying it as a quote
 * under a one-line attribution, then say so in a toast. A failure is a toast
 * too. Resolves true when the message went out.
 */
export async function forwardMessage(
  target: JsGroup,
  message: Pick<JsMessage, 'content'>,
  from: { authorName: string; fromChannel: string | null },
  t: Translate,
): Promise<boolean> {
  try {
    await nostrActions.sendMessage(
      target.id,
      forwardedContent(message, { ...from, label: t('chat.message.forwarded') }),
    );
    useToastStore.getState().pushToast({
      title: t('chat.message.forwardedTo', { channel: target.name ?? target.id.slice(0, 8) }),
      body: '',
    });
    return true;
  } catch (e) {
    useToastStore.getState().pushToast({ title: t('chat.message.forwardFailed'), body: errorReason(t, e) });
    return false;
  }
}
