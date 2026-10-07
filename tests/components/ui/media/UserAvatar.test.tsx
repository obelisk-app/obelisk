import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import UserAvatar from '@/components/ui/media/UserAvatar';
import { avatarInitials, petnameFor } from '@/utils/identity/display-name';

const HEX = '6a'.repeat(32);

describe('UserAvatar', () => {
  it('renders the picture when there is one', () => {
    const { container } = render(<UserAvatar pubkey={HEX} picture="https://x.example/a.png" size={8} alt="Alice" />);
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', 'https://x.example/a.png');
    expect(img).toHaveStyle({ width: '32px', height: '32px' });
  });

  it('loads the picture as remote media: no referrer, lazy', () => {
    const { container } = render(<UserAvatar pubkey={HEX} picture="https://x.example/a.png" size={8} />);
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  it('hides a picture that fails to load', () => {
    const { container } = render(<UserAvatar pubkey={HEX} picture="https://x.example/broken.png" size={8} />);
    const img = container.querySelector('img')!;
    fireEvent.error(img);
    expect(img.style.display).toBe('none');
  });

  it('a named fallback shows the first letter of the name', () => {
    render(<UserAvatar pubkey={HEX} picture={null} size={8} name="bob smith" />);
    expect(screen.getByText('B')).toHaveClass('bg-lc-olive', 'text-lc-green', 'text-xs');
  });

  it('a nameless fallback never reads a letter off the hex key', () => {
    const { container } = render(<UserAvatar pubkey={HEX} picture={null} size={8} />);
    const text = container.textContent ?? '';
    expect(text).not.toBe('6');
    expect(text).toBe(petnameFor(HEX)[0].toUpperCase());
  });

  it('two initials come from the same recipe', () => {
    const { container } = render(<UserAvatar pubkey={HEX} picture={null} size={8} initials="two" />);
    expect(container.textContent).toBe(avatarInitials(undefined, HEX));
    expect(container.textContent).toHaveLength(2);
  });
});
