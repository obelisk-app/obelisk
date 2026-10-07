import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useVoiceChatPane } from '@/hooks/shell/panes/channel/useVoiceChatPane';
import { VOICE_CHAT_MAX } from '@/constants/shell/panes';

const KEY = 'obelisk:voice-chat-width';

function mainRef(width: number) {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ width } as DOMRect);
  return { current: el };
}

beforeEach(() => localStorage.clear());

describe('useVoiceChatPane', () => {
  it('starts from the saved width in its very first render', () => {
    localStorage.setItem(KEY, '520');
    const widths: number[] = [];
    renderHook(() => {
      const out = useVoiceChatPane(false, mainRef(1000));
      widths.push(out.voiceChatWidth);
      return out;
    });
    expect(widths[0]).toBe(520);
  });

  it('ignores a saved width out of range', () => {
    localStorage.setItem(KEY, String(VOICE_CHAT_MAX + 1));
    const { result } = renderHook(() => useVoiceChatPane(false, mainRef(1000)));
    expect(result.current.voiceChatWidth).toBe(400);
  });

  it('opening the rail defaults it to half the voice area and saves that', () => {
    const ref = mainRef(1000);
    const { result, rerender } = renderHook(({ open }) => useVoiceChatPane(open, ref), { initialProps: { open: false } });
    rerender({ open: true });
    expect(result.current.voiceChatWidth).toBe(500);
    expect(localStorage.getItem(KEY)).toBe('500');
  });
});
