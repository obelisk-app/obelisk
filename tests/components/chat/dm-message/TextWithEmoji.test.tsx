import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TextWithEmoji } from '@/components/chat/dm-message/TextWithEmoji';

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
});
