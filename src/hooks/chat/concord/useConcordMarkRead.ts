import { useEffect, useRef, type RefObject } from 'react';
import type { JsMessage } from '@/services/nostr-bridge';
import { useConcordNavigation } from '@/store/chat/concord';
import { useConcordReadStore } from '@/store/chat/concord-read';

/** Only the mounted chat scroller can acknowledge messages, never the sidebar/list. */
export function useConcordMarkRead(account: string, scope: string | undefined, messages: JsMessage[], scroller: RefObject<HTMLDivElement | null>, covered = false) {
  const position = useRef({ scope: '', nearBottom: true });
  const listOpen = useConcordNavigation(state => state.mobileChannelsOpen);
  useEffect(() => {
    const element = scroller.current;
    if (!element || !scope || listOpen || covered) return;
    if (position.current.scope !== scope) position.current = { scope, nearBottom: true };
    if (position.current.nearBottom) element.scrollTo({ top: element.scrollHeight });
    const advance = () => {
      if (document.visibilityState !== 'visible' || !document.hasFocus() || !useConcordNavigation.getState().open) return;
      if (element.scrollHeight - element.scrollTop - element.clientHeight > 80) return;
      const latest = messages.filter(message => !message.pending && !message.failed && message.pubkey !== account).at(-1);
      if (latest && latest.createdAt * 1000 <= Date.now() + 300_000) useConcordReadStore.getState().merge(account, { [scope]: latest.createdAt * 1000 });
    };
    const onScroll = () => {
      position.current.nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight <= 80;
      advance();
    };
    advance();
    element.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', advance);
    window.addEventListener('focus', advance);
    return () => { element.removeEventListener('scroll', onScroll); document.removeEventListener('visibilitychange', advance); window.removeEventListener('focus', advance); };
  }, [account, scope, messages, scroller, listOpen, covered]);
}
