import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import EmojiSheet from '@/app/[locale]/app/mobile/sheets/message/EmojiSheet';

describe('EmojiSheet', () => {
  it('closes on a tap outside the sheet but not inside it', () => {
    const onClose = vi.fn();
    const { container } = render(<EmojiSheet onClose={onClose}><span>picker</span></EmojiSheet>);
    fireEvent.click(screen.getByText('picker'));
    expect(onClose).not.toHaveBeenCalled();
    expect(container.querySelector('.emoji-sheet .sheet-handle')).not.toBeNull();
    fireEvent.click(container.querySelector('.emoji-sheet-host')!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
