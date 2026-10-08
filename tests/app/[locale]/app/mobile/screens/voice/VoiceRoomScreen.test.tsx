import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { VoiceRoomScreen } from '@/app/[locale]/app/mobile/screens/voice/VoiceRoomScreen';
import { group } from '@tests/app/[locale]/app/mobile/mobile-fixtures';

vi.mock('@/components/voice/room/LazyVoiceRoom', () => ({
  default: (p: { channelId: string; channelName?: string; onToggleChat: () => void }) => (
    <button data-testid="voice-room" data-channel={p.channelId} data-name={p.channelName ?? ''} onClick={p.onToggleChat} />
  ),
}));

const call = (status: string) => ({ g1: { hostPubkey: 'h'.repeat(64), status, participantCount: 1, expiresAt: 0, createdAt: 0 } });

describe('VoiceRoomScreen', () => {
  it('titles the room after the channel and hands the room its id and name', () => {
    renderWithBridge(<VoiceRoomScreen groupId="g1" back={vi.fn()} openChat={vi.fn()} />, fakeBridge({ groups: [group({ id: 'g1', name: 'Lounge', kind: 'voice' })] }));
    expect(screen.getByText('Lounge')).toBeInTheDocument();
    expect(screen.getByTestId('voice-room')).toHaveAttribute('data-name', 'Lounge');
    expect(screen.queryByText('SFU')).toBeNull();
    expect(document.querySelector('.voice-room-sub')).toBeNull();
  });

  it('tags an SFU room and falls back to a generic name for an unknown channel', () => {
    renderWithBridge(<VoiceRoomScreen groupId="g1" back={vi.fn()} openChat={vi.fn()} />, fakeBridge({ groups: [group({ id: 'g1', kind: 'voice-sfu' })] }));
    expect(screen.getByText('SFU')).toBeInTheDocument();
    expect(screen.getByTestId('voice-room')).toHaveAttribute('data-name', '');
  });

  it('shows the call status, translated when known and as it came otherwise', () => {
    const { unmount } = renderWithBridge(<VoiceRoomScreen groupId="g1" back={vi.fn()} openChat={vi.fn()} />, fakeBridge({ activeCallByChannel: call('connected') }));
    expect(document.querySelector('.voice-room-sub')?.textContent).toBeTruthy();
    const known = document.querySelector('.voice-room-sub')?.textContent;
    unmount();
    renderWithBridge(<VoiceRoomScreen groupId="g1" back={vi.fn()} openChat={vi.fn()} />, fakeBridge({ activeCallByChannel: call('weird-status') }));
    expect(document.querySelector('.voice-room-sub')?.textContent).toBe('weird-status');
    expect(known).not.toBe('connected');
  });

  it('minimizes with back and opens the chat from the room', () => {
    const back = vi.fn();
    const openChat = vi.fn();
    renderWithBridge(<VoiceRoomScreen groupId="g1" back={back} openChat={openChat} />, fakeBridge());
    fireEvent.click(screen.getByTestId('minimize-call-btn'));
    expect(back).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('voice-room'));
    expect(openChat).toHaveBeenCalledTimes(1);
  });
});
