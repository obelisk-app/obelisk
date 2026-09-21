import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/context';
import { ComposeButton } from './FeedControls';

const wrap = (ui: React.ReactNode) => render(
  <LocaleProvider initialLocale="en">{ui}</LocaleProvider>,
);

const PUBKEY = 'a'.repeat(64);

describe('ComposeButton', () => {
  it('is a full-width row, not a small pill', () => {
    // The old affordance was a ~120px "+ Create post" pill floating in an
    // empty strip; it read as a toolbar button rather than an invitation.
    const onClick = vi.fn();
    wrap(<ComposeButton pubkey={PUBKEY} name="Alice" onClick={onClick} />);
    const button = screen.getByTestId('feed-compose');
    expect(button.className).toContain('w-full');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalled();
  });

  it('shows whose account the post will come from', () => {
    wrap(<ComposeButton pubkey={PUBKEY} name="Alice" picture={null} onClick={vi.fn()} />);
    // The avatar is the cue; the old pill gave none.
    expect(screen.getByTestId('feed-compose').querySelector('img, span')).toBeTruthy();
  });

  it('previews the placeholder the composer will use', () => {
    wrap(<ComposeButton pubkey={PUBKEY} onClick={vi.fn()} />);
    expect(screen.getByTestId('feed-compose')).toHaveTextContent("What's happening?");
  });

  it('accepts a custom placeholder and test id', () => {
    wrap(
      <ComposeButton pubkey={PUBKEY} onClick={vi.fn()} placeholder="Say something" testId="profile-create-post" />,
    );
    expect(screen.getByTestId('profile-create-post')).toHaveTextContent('Say something');
  });
});

