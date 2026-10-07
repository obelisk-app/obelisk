import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { fakeBridge } from '@tests/support/fake-bridge';
import { LocaleProvider } from '@tests/support/intl';
import { registerBridge, unregisterBridge } from '@/services/nostr-bridge/facade/bridge-slot';
import { useToastStore } from '@/store/feedback/toast';
import { useSpoilerText } from '@/hooks/chat/message/useSpoilerText';
import { useVideoMedia } from '@/hooks/chat/message/useVideoMedia';
import { useVoicePlayback } from '@/hooks/chat/message/useVoicePlayback';
import { useChannelLinkPill } from '@/hooks/chat/message/useChannelLinkPill';
import { useForwardMessageModal } from '@/hooks/chat/message/useForwardMessageModal';
import { useMessageContent } from '@/hooks/chat/message/useMessageContent';
import type { JsGroup, JsMessage } from '@/services/nostr-bridge';

const intl = ({ children }: { children: React.ReactNode }) => <LocaleProvider initialLocale="en">{children}</LocaleProvider>;
const loaded = <T,>(props: Record<string, number>) => ({ currentTarget: props }) as unknown as React.SyntheticEvent<T>;

describe('useSpoilerText', () => {
  it('reveals on reveal, Enter or Space only', () => {
    const { result } = renderHook(() => useSpoilerText());
    act(() => result.current.onKeyDown({ key: 'x' } as React.KeyboardEvent));
    expect(result.current.revealed).toBe(false);
    act(() => result.current.onKeyDown({ key: ' ' } as React.KeyboardEvent));
    expect(result.current.revealed).toBe(true);
  });
});

describe('useVideoMedia', () => {
  it('switches an audio-only webm to a voice note with its duration', () => {
    const { result } = renderHook(() => useVideoMedia('https://x/a.webm'));
    act(() => result.current.onLoadedMetadata(loaded<HTMLVideoElement>({ videoWidth: 640, duration: 3 })));
    expect(result.current.voiceDuration).toBeNull();
    act(() => result.current.onLoadedMetadata(loaded<HTMLVideoElement>({ videoWidth: 0, duration: 3 })));
    expect(result.current.voiceDuration).toBe(3);
  });

  it('never switches a non-webm', () => {
    const { result } = renderHook(() => useVideoMedia('https://x/a.mp4'));
    act(() => result.current.onLoadedMetadata(loaded<HTMLVideoElement>({ videoWidth: 0, duration: 3 })));
    expect(result.current.voiceDuration).toBeNull();
  });
});

describe('useVoicePlayback onLoadedMetadata', () => {
  it('takes a finite duration and ignores an infinite one', () => {
    const { result } = renderHook(() => useVoicePlayback(4));
    act(() => result.current.onLoadedMetadata(loaded<HTMLAudioElement>({ duration: Infinity })));
    expect(result.current.duration).toBe(4);
    act(() => result.current.onLoadedMetadata(loaded<HTMLAudioElement>({ duration: 9 })));
    expect(result.current.duration).toBe(9);
  });
});

describe('useChannelLinkPill', () => {
  it('prefixes and titles a channel, a message and a publication link', () => {
    const run = (m?: string, p?: string) => renderHook(() => useChannelLinkPill('general', '/app?c=general', m, p), { wrapper: intl }).result.current;
    expect(run()).toMatchObject({ prefix: '#', label: 'general', noAccess: false });
    expect(run('m1').prefix).toBe('↩ ');
    expect(run(undefined, 'p1').prefix).toBe('📋 ');
    expect(run().title).toContain('general');
  });
});

describe('useForwardMessageModal', () => {
  afterEach(() => {
    unregisterBridge();
    useToastStore.setState({ toasts: [] } as never);
  });
  const groups = [{ id: 'from', name: 'origin' }, { id: 'a', name: 'general' }] as unknown as JsGroup[];

  it('filters targets by the query', () => {
    const { result } = renderHook(() => useForwardMessageModal({ content: 'x' } as JsMessage, 'Ana', 'from', () => {}), { wrapper: bridgeWrapper(fakeBridge({ groups })) });
    expect(result.current.targets.map((g) => g.id)).toEqual(['a']);
    act(() => result.current.setQuery('zzz'));
    expect(result.current.targets).toEqual([]);
  });

  it('closes after a forward goes out, and unlocks after one fails', async () => {
    const sendMessage = vi.fn(async (..._args: unknown[]) => undefined);
    const bridge = fakeBridge({ groups }, { sendMessage } as never);
    registerBridge(bridge);
    const onClose = vi.fn();
    const { result } = renderHook(() => useForwardMessageModal({ content: 'x' } as JsMessage, 'Ana', 'from', onClose), { wrapper: bridgeWrapper(bridge) });
    await act(async () => result.current.forward(groups[1]));
    expect(onClose).toHaveBeenCalledOnce();
    expect(sendMessage.mock.calls[0][1]).toContain('#origin');
    sendMessage.mockRejectedValueOnce(new Error('x'));
    await act(async () => result.current.forward(groups[1]));
    expect(result.current.sending).toBeNull();
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('useMessageContent', () => {
  it('hoists YouTube links into embeds, and loads the markdown renderer', async () => {
    const { result } = renderHook(
      () => useMessageContent({ content: 'see https://youtu.be/dQw4w9WgXcQ' }),
      { wrapper: bridgeWrapper(fakeBridge()) },
    );
    expect(result.current.youtube).toEqual([{ url: 'https://youtu.be/dQw4w9WgXcQ', id: 'dQw4w9WgXcQ' }]);
    expect(result.current.media.show).toBe(true);
    await waitFor(() => expect(result.current.renderMarkdown).not.toBeNull());
  });
});
