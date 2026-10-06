import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/services/social/relay-status', () => ({ probeRelay: vi.fn() }));

import SocialRelayRows from '@/components/settings/social-relays/SocialRelayRows';

const t = (key: string) => (key === 'preferences.socialRelays.relay' ? 'Relay' : 'Remove');

describe('SocialRelayRows', () => {
  it('names each field, flags invalid ones and reports edits and removals', () => {
    const onUpdate = vi.fn();
    const onRemove = vi.fn();
    render(
      <SocialRelayRows
        draft={['wss://a.example', 'nope']}
        statuses={{}}
        invalid={new Set([1])}
        onUpdate={onUpdate}
        onRemove={onRemove}
        t={t}
      />,
    );
    const good = screen.getByRole('textbox', { name: 'Relay 1' });
    const bad = screen.getByRole('textbox', { name: 'Relay 2' });
    expect(good).not.toHaveAttribute('aria-invalid');
    expect(good).toHaveClass('font-mono', 'text-xs', 'min-w-0', 'flex-1');
    expect(bad).toHaveAttribute('aria-invalid', 'true');
    expect(bad).toHaveClass('border-red-500');
    fireEvent.change(good, { target: { value: 'wss://b.example' } });
    expect(onUpdate).toHaveBeenCalledWith(0, 'wss://b.example');
    fireEvent.click(screen.getByRole('button', { name: 'Remove nope' }));
    expect(onRemove).toHaveBeenCalledWith(1);
  });

  it('a single row cannot be removed', () => {
    render(<SocialRelayRows draft={['wss://a.example']} statuses={{}} invalid={new Set()} onUpdate={() => {}} onRemove={() => {}} t={t} />);
    expect(screen.getByRole('button', { name: 'Remove wss://a.example' })).toBeDisabled();
  });
});
