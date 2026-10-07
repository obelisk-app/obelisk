import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TextWithEmoji } from '@/components/chat/dm/message/TextWithEmoji';

describe('TextWithEmoji', () => {
  it('links URLs and draws known custom emoji, repeatedly, without placeholder text leaking', () => {
    for (let i = 0; i < 3; i += 1) {
      const { container, unmount } = render(
        <TextWithEmoji text="hi :obelisk_logo: see https://x.example/a" emojis={{ obelisk_logo: 'https://x/logo.png' }} linkClass="l" />,
      );
      expect(container.querySelectorAll('img')).toHaveLength(1);
      expect(container.querySelector('a')).toHaveAttribute('href', 'https://x.example/a');
      expect(container.textContent).not.toContain('〈');
      unmount();
    }
  });

  it('keeps the text around links and emoji in order, and links get the class and safe rel', () => {
    const { container } = render(
      <TextWithEmoji text="a :obelisk_logo: b https://x.example/a c" emojis={{ obelisk_logo: 'https://x/logo.png' }} linkClass="l" />,
    );
    expect(container.textContent).toBe('a  b https://x.example/a c');
    const link = container.querySelector('a')!;
    expect(link).toHaveClass('l');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow');
    expect(link).toHaveAttribute('target', '_blank');
    expect(container.querySelector('img')).toHaveAttribute('alt', ':obelisk_logo:');
  });

  it('plain text renders as it is', () => {
    const { container } = render(<TextWithEmoji text="just words" emojis={{}} linkClass="l" />);
    expect(container.innerHTML).toBe('just words');
  });
});
