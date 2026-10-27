import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar } from '@/app/[locale]/app/desktop/Avatar';
import { safeNpub } from '@/utils/identity/short-npub';

const PK = 'ab' + '0'.repeat(62);

describe('desktop Avatar', () => {
  it('draws the picture at size * 4 px and hides it when it fails to load', () => {
    const { container } = render(<Avatar pubkey={PK} size={7} picture="https://example.com/a.png" />);
    const img = container.querySelector('img')!;
    expect(img.style.width).toBe('28px');
    fireEvent.error(img);
    expect(img.style.display).toBe('none');
  });

  it('falls back to a tinted tile with the npub characters, never hex digits', () => {
    render(<Avatar pubkey={PK} size={8} picture={null} />);
    const tile = screen.getByText(safeNpub(PK).slice(5, 7).toUpperCase());
    expect(tile.style.width).toBe('32px');
    expect(tile.style.background).not.toBe('');
  });
});
