import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { MessageActionsSheet } from '@/app/[locale]/app/mobile/sheets/message/MessageActionsSheet';

const MSG = { id: 'evt-1', pubkey: 'b'.repeat(64), content: 'copy me' };
const writeText = vi.fn().mockResolvedValue(undefined);

function mount(over: Partial<React.ComponentProps<typeof MessageActionsSheet>> = {}) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  const close = vi.fn();
  const onZap = vi.fn();
  renderWithBridge(<MessageActionsSheet msg={MSG} close={close} onZap={onZap} {...over} />, fakeBridge({ userMetadata: { [MSG.pubkey]: { name: 'Bea' } as never } }));
  return { close, onZap };
}

afterEach(() => writeText.mockClear());

describe('MessageActionsSheet', () => {
  it('shows who wrote the message and what it says', () => {
    mount();
    expect(screen.getByText('Bea')).toBeInTheDocument();
    expect(screen.getByText('copy me')).toBeInTheDocument();
  });

  it('sends a quick reaction for the message and closes', () => {
    const listener = vi.fn();
    window.addEventListener('obelisk-mobile:react', listener as EventListener);
    try {
      const { close } = mount();
      fireEvent.click(screen.getByText('🔥'));
      const ev = listener.mock.calls[0][0] as CustomEvent<{ msg: typeof MSG; emoji: string; customEmojis?: unknown }>;
      expect(ev.detail).toEqual({ msg: MSG, emoji: '🔥', customEmojis: undefined });
      expect(close).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('obelisk-mobile:react', listener as EventListener);
    }
  });

  it('copies the text and the event id, closing each time', () => {
    const { close } = mount();
    fireEvent.click(screen.getByText('Copy text'));
    expect(writeText).toHaveBeenLastCalledWith('copy me');
    fireEvent.click(screen.getByText('Copy event ID'));
    expect(writeText).toHaveBeenLastCalledWith('evt-1');
    expect(close).toHaveBeenCalledTimes(2);
  });

  it('closes even when the clipboard throws', () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => { throw new Error('denied'); } }, configurable: true });
    const close = vi.fn();
    renderWithBridge(<MessageActionsSheet msg={MSG} close={close} onZap={vi.fn()} />, fakeBridge());
    fireEvent.click(screen.getByText('Copy text'));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('zaps from the zap row and closes on a backdrop tap', () => {
    const { close, onZap } = mount();
    fireEvent.click(document.querySelector('.ma-action.zap')!);
    expect(onZap).toHaveBeenCalledTimes(1);
    fireEvent.click(document.querySelector('.sheet-backdrop')!);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('offers no delete without the right to delete', () => {
    mount();
    expect(screen.queryByTestId('mobile-msg-actions-delete')).toBeNull();
  });
});
