import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { LocaleProvider } from '@tests/support/intl';
import { useVoiceStore } from '@/store/voice';
import { FullscreenButton, MuteForMeButton } from '@/components/voice/room/controls';

/** The tiles read their copy through next-intl, so every render gets the English messages. */
const render = (ui: React.ReactElement) => rtlRender(ui, { wrapper: LocaleProvider });

const A = 'a'.repeat(64);

beforeEach(() => {
  useVoiceStore.setState({ localMutedPubkeys: {} });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('MuteForMeButton', () => {
  it('mutes and unmutes one peer in the store only, without reaching the tile behind it', () => {
    const onTile = vi.fn();
    render(<div onClick={onTile}><MuteForMeButton pubkey={A} /></div>);
    const btn = screen.getByTestId('mute-for-me');
    expect(btn).toHaveAttribute('data-muted', 'false');
    fireEvent.click(btn);
    expect(useVoiceStore.getState().localMutedPubkeys[A]).toBe(true);
    expect(screen.getByTestId('mute-for-me')).toHaveAttribute('data-muted', 'true');
    fireEvent.click(screen.getByTestId('mute-for-me'));
    expect(useVoiceStore.getState().localMutedPubkeys[A]).toBeUndefined();
    // The tile's pin handler must not fire for a mute click.
    expect(onTile).not.toHaveBeenCalled();
  });
});

describe('FullscreenButton', () => {
  it('asks the browser to fullscreen its target without bubbling to the tile', async () => {
    const onTile = vi.fn();
    const target = document.createElement('div');
    const requestFullscreen = vi.fn(async () => {});
    (target as unknown as { requestFullscreen: () => Promise<void> }).requestFullscreen = requestFullscreen;
    render(<div onClick={onTile}><FullscreenButton targetRef={{ current: target }} /></div>);
    expect(screen.getByTestId('fullscreen-toggle')).toHaveAttribute('data-fullscreen', 'false');
    fireEvent.click(screen.getByTestId('fullscreen-toggle'));
    await Promise.resolve();
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(onTile).not.toHaveBeenCalled();
  });
});
