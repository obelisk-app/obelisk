import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { JsMessage } from '@/services/nostr-bridge';
import { buildTimeline } from '@/app/app/mobile/screens/channel/channel-timeline';
import { useReplyTarget } from '@/app/app/mobile/screens/channel/usePhoneChannel';

const msg = (id: string, createdAt: number) => ({ id, pubkey: 'a', content: id, createdAt }) as JsMessage;
const t = (k: string) => k;

describe('buildTimeline', () => {
  it('puts one divider before the first message of each day', () => {
    const day = 86_400;
    const base = Math.floor(new Date(2026, 0, 10, 12).getTime() / 1000);
    const items = buildTimeline([msg('a', base), msg('b', base + 60), msg('c', base + day)], t, 'en');
    expect(items.map((i) => i.type)).toEqual(['divider', 'msg', 'msg', 'divider', 'msg']);
    expect(items[1].key).toBe('a');
  });

  it('is empty for no messages', () => {
    expect(buildTimeline([], t, 'en')).toEqual([]);
  });
});

describe('useReplyTarget', () => {
  const messages = [msg('m1', 1), msg('m2', 2)];

  it('takes a reply request from the actions sheet for a message it has', () => {
    const { result } = renderHook(() => useReplyTarget('g', messages));
    act(() => { window.dispatchEvent(new CustomEvent('obelisk-mobile:reply', { detail: { msgId: 'm2' } })); });
    expect(result.current.replyingTo?.id).toBe('m2');
    act(() => { window.dispatchEvent(new CustomEvent('obelisk-mobile:reply', { detail: { msgId: 'gone' } })); });
    expect(result.current.replyingTo?.id).toBe('m2');
  });

  it('drops the reply target when the channel changes', () => {
    const { result, rerender } = renderHook(({ g }) => useReplyTarget(g, messages), { initialProps: { g: 'g1' } });
    act(() => result.current.setReplyingTo(messages[0]));
    rerender({ g: 'g2' });
    expect(result.current.replyingTo).toBeNull();
  });
});
