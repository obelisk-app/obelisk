import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import UserRow from '@/components/ui/data/UserRow';

const PK = 'b'.repeat(64);

describe('UserRow', () => {
  it('shows avatar, name and meta, with trailing controls beside', () => {
    render(<UserRow pubkey={PK} picture={null} name="Alice" meta="alice@example.com" trailing={<span>admin</span>} data-testid="row" />);
    const row = screen.getByTestId('row');
    expect(row).toHaveClass('flex', 'items-center', 'gap-2');
    expect(screen.getByText('Alice')).toHaveClass('truncate', 'text-sm', 'text-lc-white');
    expect(screen.getByText('alice@example.com')).toHaveClass('text-[11px]', 'text-lc-muted');
    expect(screen.getByText('admin')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('with onClick the person is one button and trailing controls stay outside it', () => {
    const onClick = vi.fn();
    render(<UserRow pubkey={PK} picture={null} name="Alice" onClick={onClick} trailing={<button type="button">Revoke</button>} />);
    const person = screen.getByRole('button', { name: /Alice/ });
    expect(person).toHaveAttribute('type', 'button');
    expect(person).not.toContainElement(screen.getByRole('button', { name: 'Revoke' }));
    fireEvent.click(person);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('selected tints the row and marks the button current', () => {
    render(<UserRow pubkey={PK} picture={null} name="Alice" state="selected" onClick={() => {}} data-testid="row" />);
    expect(screen.getByTestId('row')).toHaveClass('bg-lc-green/15');
    expect(screen.getByRole('button')).toHaveAttribute('aria-current', 'true');
  });

  it.each([
    ['sm', '28px'],
    ['md', '32px'],
  ] as const)('size %s sets the avatar', (size, px) => {
    const { container } = render(<UserRow pubkey={PK} picture="https://x.example/p.png" name="A" size={size} />);
    expect(container.querySelector('img')).toHaveStyle({ width: px });
  });
});
