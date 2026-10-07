import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import FeedFloatingControls from '@/components/social/feed/FeedFloatingControls';

function renderControls(overrides: Partial<Parameters<typeof FeedFloatingControls>[0]> = {}) {
  const scroller = document.createElement('div');
  scroller.scrollTo = vi.fn();
  const props = {
    showBackToTop: true,
    showCompose: true,
    pendingCount: 0,
    mobile: false,
    scrollRef: { current: scroller },
    onShowPending: vi.fn(),
    onCompose: vi.fn(),
    ...overrides,
  };
  render(<LocaleProvider initialLocale="en"><FeedFloatingControls {...props} /></LocaleProvider>);
  return { props, scroller };
}

describe('FeedFloatingControls', () => {
  it('merges the pending notes and scrolls to the top', () => {
    const { props, scroller } = renderControls({ pendingCount: 3 });
    fireEvent.click(screen.getByTestId('feed-back-to-top'));
    expect(props.onShowPending).toHaveBeenCalledTimes(1);
    expect(scroller.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
    expect(screen.getByTestId('feed-back-to-top')).toHaveTextContent('3');
  });

  it('opens the composer from the floating button', () => {
    const { props } = renderControls();
    fireEvent.click(screen.getByTestId('feed-compose-fab'));
    expect(props.onCompose).toHaveBeenCalledTimes(1);
  });

  it('renders neither when both are hidden', () => {
    renderControls({ showBackToTop: false, showCompose: false });
    expect(screen.queryByTestId('feed-back-to-top')).toBeNull();
    expect(screen.queryByTestId('feed-compose-fab')).toBeNull();
  });
});
