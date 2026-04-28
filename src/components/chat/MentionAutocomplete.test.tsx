import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import MentionAutocomplete from './MentionAutocomplete';
import { MemberInfo } from '@/lib/mentions';

const members: MemberInfo[] = [
  { pubkey: 'a'.repeat(64), displayName: 'Alice', picture: 'https://example.com/alice.jpg' },
  { pubkey: 'b'.repeat(64), displayName: 'Bob' },
  { pubkey: 'c'.repeat(64), displayName: 'Charlie' },
];

describe('MentionAutocomplete', () => {
  it('renders nothing when members is empty', () => {
    const { container } = render(
      <MentionAutocomplete members={[]} onSelect={vi.fn()} onClose={vi.fn()} selectedIndex={0} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders member options', () => {
    render(
      <MentionAutocomplete members={members} onSelect={vi.fn()} onClose={vi.fn()} selectedIndex={0} />
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Charlie')).toBeInTheDocument();
  });

  it('highlights the selected index', () => {
    render(
      <MentionAutocomplete members={members} onSelect={vi.fn()} onClose={vi.fn()} selectedIndex={1} />
    );
    const options = screen.getAllByTestId('mention-option');
    expect(options[1].className).toContain('bg-lc-border/60');
    expect(options[0].className).not.toContain('bg-lc-border/60');
  });

  it('calls onSelect when clicking a member', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <MentionAutocomplete members={members} onSelect={onSelect} onClose={vi.fn()} selectedIndex={0} />
    );
    await user.click(screen.getByText('Bob'));
    expect(onSelect).toHaveBeenCalledWith(members[1]);
  });

  it('shows avatar image when picture is provided', () => {
    render(
      <MentionAutocomplete members={members} onSelect={vi.fn()} onClose={vi.fn()} selectedIndex={0} />
    );
    const img = screen.getByAltText('');
    expect(img).toHaveAttribute('src', 'https://example.com/alice.jpg');
  });

  it('shows pubkey snippet for each member', () => {
    render(
      <MentionAutocomplete members={[members[0]]} onSelect={vi.fn()} onClose={vi.fn()} selectedIndex={0} />
    );
    expect(screen.getByText('aaaaaaaa...')).toBeInTheDocument();
  });
});
