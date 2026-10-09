import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LocaleProvider } from '@tests/support/intl';
import PqMessageMark from '@/components/chat/pq/PqMessageMark';

describe('PqMessageMark', () => {
  it('renders nothing for a healthy message', () => {
    const { container } = render(
      <LocaleProvider initialLocale="en">
        <PqMessageMark mark={null} />
      </LocaleProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('exposes the gift-wrap detail via title and aria-label, not just title', () => {
    render(
      <LocaleProvider initialLocale="en">
        <PqMessageMark mark="no-giftwrap" />
      </LocaleProvider>,
    );
    const mark = screen.getByTestId('pq-mark');
    // Plain language on purpose: "relays" is jargon to everyone outside Nostr,
    // and this string is aimed at a reader who has never heard the word.
    const detail = 'An older message using NIP-04. Its content is encrypted, but relays can see the sender, recipient and timestamp.';
    expect(mark).toHaveAttribute('title', detail);
    expect(mark).toHaveAttribute('aria-label', expect.stringContaining(detail));
  });

  it('exposes a detail for the no-pq mark too', () => {
    render(
      <LocaleProvider initialLocale="en">
        <PqMessageMark mark="quantum" />
      </LocaleProvider>,
    );
    const mark = screen.getByTestId('pq-mark');
    expect(mark.getAttribute('title')).toBeTruthy();
    expect(mark.getAttribute('aria-label')).toBeTruthy();
  });

  it('defaults to the muted color', () => {
    render(
      <LocaleProvider initialLocale="en">
        <PqMessageMark mark="quantum" />
      </LocaleProvider>,
    );
    expect(screen.getByTestId('pq-mark')).toHaveClass('text-lc-muted');
  });

  it('switches to the on-accent color for outgoing bubbles', () => {
    render(
      <LocaleProvider initialLocale="en">
        <PqMessageMark mark="quantum" onAccent />
      </LocaleProvider>,
    );
    const mark = screen.getByTestId('pq-mark');
    expect(mark).toHaveClass('text-black/60');
    expect(mark).not.toHaveClass('text-lc-muted');
  });
});
