'use client';

/**
 * One DM conversation, minus its paint: the message list in order, the day
 * dividers, the post-quantum marks and the header's protection level, the
 * retry/dismiss actions for a failed send; `useDmThreadScroll` is the
 * stick-to-bottom scroll beside it.
 * `DMPanel` (desktop) and `DmThreadScreen` (phone) are skins over this.
 *
 * Post-quantum provenance: the shield is capability state for the whole
 * conversation; the marks are per message and aggregated to transitions
 * only (see `threadMarks`: every message in pre-NIP-17 history is NIP-04,
 * so a pill per bubble would be unreadable). The marks are gated on the
 * `postQuantumEnabled` preference, since warning a user about protection
 * they deliberately turned off is nagging rather than teaching. The shield
 * is not: two of its three states are about the gift wrap, which matters to
 * every user, and it is one icon, so it cannot nag.
 */
import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';
import { nostrActions, useDirectMessages, type JsDirectMessage } from '@/services/nostr-bridge';
import { useAuthor } from '@/services/social/useAuthor';
import { displayNameFor } from '@/utils/identity/display-name';
import { dayKey, dayLabel } from '@/utils/format/day-label';
import { usePqConversationStatus } from '@/services/pq/hooks';
import { protectionLevel, threadMarks } from '@/services/pq/status';
import { usePreferences } from '@/services/preferences';
import { useDMStore } from '@/store/dm';
import { useTranslation } from '@/i18n/context';

export type DmThreadItem =
  | { readonly type: 'divider'; readonly key: string; readonly label: string }
  | { readonly type: 'msg'; readonly key: string; readonly msg: JsDirectMessage; readonly index: number };

export interface DmThread {
  readonly meta: ReturnType<typeof useAuthor>;
  readonly peerName: string;
  /** The thread, oldest first, only messages with this counterparty. */
  readonly messages: ReadonlyArray<JsDirectMessage>;
  /** `messages` interleaved with a divider wherever the calendar day changes. */
  readonly items: ReadonlyArray<DmThreadItem>;
  /** Per-message post-quantum mark, aligned with `messages` by index; empty when the preference is off. */
  readonly marks: ReturnType<typeof threadMarks>;
  /** What the next send on this thread will use (the per-thread override, else NIP-17). */
  readonly sendProtocol: 'nip04' | 'nip17';
  readonly protection: ReturnType<typeof protectionLevel>;
  readonly retry: (clientTag: string) => void;
  readonly dismiss: (clientTag: string) => void;
}

const STICK_THRESHOLD_PX = 100;

/**
 * Attach to the thread's scroll container. It follows the bottom of the list
 * while the reader is near it, and leaves them alone once they have scrolled
 * up to read. A new peer always starts at the bottom. The scroll itself waits
 * a frame so the new rows have laid out (the phone's bubbles reflow with the
 * keyboard inset).
 *
 * A separate hook rather than a field on `DmThread`: a ref inside the thread
 * object would make every read of it look like a ref read to the React
 * compiler's lint.
 */
export function useDmThreadScroll(peer: string | null, length: number): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD_PX;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [peer]);

  useEffect(() => {
    stick.current = true;
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [peer]);

  useEffect(() => {
    if (!stick.current) return;
    const el = ref.current;
    if (!el) return;
    const id = requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    return () => cancelAnimationFrame(id);
  }, [length]);

  return ref;
}

export function useDmThread(peer: string | null): DmThread {
  const { t, locale } = useTranslation();
  const dms = useDirectMessages();
  // Two-tier identity, same as the feed (see `useAuthor`): the bridge alone
  // only knows people from your NIP-29 rooms, so a DM peer from the wider
  // network rendered as a truncated pubkey with a letter avatar.
  const meta = useAuthor(peer);
  const pqEnabled = usePreferences().postQuantumEnabled;
  const pqStatus = usePqConversationStatus(peer);
  const sendProtocol = useDMStore((s) => (peer ? s.protocolOverrides[peer] : undefined)) ?? 'nip17';

  const messages = useMemo(() => {
    if (!peer) return [];
    const list = (dms[peer] ?? []).filter((m) => m.counterparty === peer);
    return [...list].sort((a, b) => a.createdAt - b.createdAt);
  }, [dms, peer]);

  const marks = useMemo(
    () => (pqEnabled
      ? threadMarks(messages.map((m) => ({
          protocol: m.protocol ?? 'nip04',
          pq: m.pq,
          settled: !m.pending && !m.failed,
        })))
      : []),
    [messages, pqEnabled],
  );

  const items = useMemo(() => {
    const out: DmThreadItem[] = [];
    let lastDay: string | null = null;
    messages.forEach((msg, index) => {
      const day = dayKey(msg.createdAt);
      if (day !== lastDay) {
        out.push({ type: 'divider', key: `d-${day}`, label: dayLabel(msg.createdAt, t, locale) });
        lastDay = day;
      }
      out.push({ type: 'msg', key: msg.id, msg, index });
    });
    return out;
  }, [messages, t, locale]);

  const retry = useCallback((clientTag: string) => {
    if (peer) void nostrActions.retryDirectMessage(peer, clientTag);
  }, [peer]);
  const dismiss = useCallback((clientTag: string) => {
    if (peer) void nostrActions.cancelPendingDirectMessage(peer, clientTag);
  }, [peer]);

  return {
    meta,
    peerName: peer ? displayNameFor(peer, meta) : '',
    messages,
    items,
    marks,
    sendProtocol,
    protection: protectionLevel({ giftWrapped: sendProtocol !== 'nip04', status: pqStatus }),
    retry,
    dismiss,
  };
}
