import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LocaleProvider } from '@tests/support/intl';
import PqShield from '@/components/chat/pq/PqShield';
import type { PqProtectionLevel } from '@/services/chat/pq/status';

function renderShield(level: PqProtectionLevel, locale: 'en' | 'es' = 'en') {
  return render(
    <LocaleProvider initialLocale={locale}>
      <PqShield level={level} guideHref="/guides/quantum-safe-dms" />
    </LocaleProvider>,
  );
}

describe('PqShield', () => {
  it('leaves standard NIP-17 without an indicator', () => {
    renderShield('wrapped');
    expect(screen.queryByTestId('pq-shield')).toBeNull();
  });
  it('renders a single control per level, not a banner', () => {
    // The whole point of replacing the notice: one small control in the
    // header, no standing block of text above the conversation.
    for (const level of ['quantum', 'basic'] as const) {
      const { unmount } = renderShield(level);
      expect(screen.getByTestId('pq-shield')).toHaveAttribute('data-level', level);
      unmount();
    }
  });

  it('keeps the explanation reachable without hover, via aria-label', () => {
    // The panel only exists while open, so a user who never hovers would
    // otherwise get an unlabelled icon button.
    renderShield('basic');
    expect(screen.getByTestId('pq-shield')).toHaveAttribute(
      'aria-label',
      'Legacy. An older message using NIP-04. Its content is encrypted, but relays can see the sender, recipient and timestamp.',
    );
  });

  it('stays closed until asked', () => {
    renderShield('basic');
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('opens on click, which is the only route a touch user has', () => {
    renderShield('basic');
    fireEvent.click(screen.getByTestId('pq-shield'));
    const panel = screen.getByRole('tooltip');
    expect(panel).toHaveTextContent('Legacy');
    expect(panel).toHaveTextContent('relays can see the sender, recipient and timestamp');
  });

  it('closes again on a second click', () => {
    renderShield('basic');
    const button = screen.getByTestId('pq-shield');
    fireEvent.click(button);
    fireEvent.click(button);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('closes on Escape', () => {
    renderShield('basic');
    fireEvent.click(screen.getByTestId('pq-shield'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('offers the guide when protection is short of quantum', () => {
    for (const level of ['basic'] as const) {
      const { unmount } = renderShield(level);
      fireEvent.click(screen.getByTestId('pq-shield'));
      expect(screen.getByRole('link', { name: 'How to get extra safe' })).toHaveAttribute(
        'href',
        '/guides/quantum-safe-dms',
      );
      unmount();
    }
  });

  it('does not nag the user who already has quantum protection', () => {
    renderShield('quantum');
    fireEvent.click(screen.getByTestId('pq-shield'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Post-quantum encryption');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('speaks Spanish, in the voseo the rest of the product uses', () => {
    renderShield('basic', 'es');
    fireEvent.click(screen.getByTestId('pq-shield'));
    const panel = screen.getByRole('tooltip');
    expect(panel).toHaveTextContent('Legacy');
    expect(panel).toHaveTextContent('NIP-04');
  });

  it('opens on focus and hover; blur keeps it open while focus moves into the panel', () => {
    const { container } = renderShield('basic');
    const button = screen.getByTestId('pq-shield');
    fireEvent.focus(button);
    const link = screen.getByRole('link', { name: 'How to get extra safe' });
    fireEvent.blur(button, { relatedTarget: link });
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.blur(button, { relatedTarget: document.body });
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.mouseEnter(container.firstElementChild!);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-describedby', screen.getByRole('tooltip').id);
    fireEvent.mouseLeave(container.firstElementChild!);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
