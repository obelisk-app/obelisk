import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { createRef, type ChangeEvent, type SyntheticEvent } from 'react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import type { ComposerHandle } from '@/hooks/chat/composer/useChannelComposer';
import { usePhoneChannelComposer } from '@/hooks/shell/mobile/screens/channel/usePhoneChannelComposer';
import { group } from '@tests/app/[locale]/app/mobile/mobile-fixtures';

vi.mock('@/hooks/relay/useBotCommands', () => ({ useBotCommands: () => [] }));

const input = (value: string, selectionStart: number | null) => ({ value, selectionStart }) as HTMLInputElement;

function setup() {
  const ref = createRef<ComposerHandle>();
  const { result } = renderHook(() => usePhoneChannelComposer({
    groupId: 'g', group: group({ id: 'g' }), messages: [], replyingTo: null, setReplyingTo: vi.fn(), onOpenNewGame: vi.fn(),
  }, ref), { wrapper: bridgeWrapper(fakeBridge()) });
  return { result, ref };
}

describe('usePhoneChannelComposer', () => {
  it('reads the draft from a change event', () => {
    const { result } = setup();
    act(() => result.current.onInputChange({ target: input('hello', 5) } as ChangeEvent<HTMLInputElement>));
    expect(result.current.draft).toBe('hello');
  });

  it('takes the end of the text as the caret when the browser gives none', () => {
    const { result } = setup();
    act(() => result.current.onInputChange({ target: input('hey', null) } as ChangeEvent<HTMLInputElement>));
    act(() => result.current.onInputSelect({ currentTarget: input('hey', null) } as SyntheticEvent<HTMLInputElement>));
    expect(result.current.draft).toBe('hey');
  });

  it('hands the screen a pickFiles handle', () => {
    const { ref } = setup();
    expect(typeof ref.current?.pickFiles).toBe('function');
  });
});
