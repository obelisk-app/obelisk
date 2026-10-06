import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SocialRelayPresets from '@/components/settings/social-relays/SocialRelayPresets';
import { SOCIAL_RELAY_PRESETS } from '@/services/social/relays';

const t = (key: string) => key;
const first = SOCIAL_RELAY_PRESETS[0].url;

describe('SocialRelayPresets', () => {
  it('adds a preset that is not in the draft', () => {
    const onAdd = vi.fn();
    render(<SocialRelayPresets draft={[]} canAdd onAdd={onAdd} t={t} />);
    fireEvent.click(screen.getAllByTestId('social-relay-preset')[0]);
    expect(onAdd).toHaveBeenCalledWith(first);
  });

  it('marks one already in the draft (trailing slash ignored) and disables it', () => {
    render(<SocialRelayPresets draft={[`${first}/`]} canAdd onAdd={() => {}} t={t} />);
    const chip = screen.getAllByTestId('social-relay-preset')[0];
    expect(chip).toBeDisabled();
    expect(chip).toHaveAttribute('data-added', 'true');
  });

  it('a full list disables the rest unless a blank row is waiting', () => {
    const { rerender } = render(<SocialRelayPresets draft={['wss://a.example']} canAdd={false} onAdd={() => {}} t={t} />);
    expect(screen.getAllByTestId('social-relay-preset')[0]).toBeDisabled();
    rerender(<SocialRelayPresets draft={['wss://a.example', '']} canAdd={false} onAdd={() => {}} t={t} />);
    expect(screen.getAllByTestId('social-relay-preset')[0]).not.toBeDisabled();
  });
});
