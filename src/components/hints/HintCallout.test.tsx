import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/context';
import HintCallout from './HintCallout';

function anchorAt(rect: Partial<DOMRect>): HTMLElement {
  const el = document.createElement('button');
  document.body.append(el);
  el.getBoundingClientRect = () => ({
    top: 100, left: 100, right: 140, bottom: 130, width: 40, height: 30,
    x: 100, y: 100, toJSON: () => ({}), ...rect,
  }) as DOMRect;
  return el;
}

const renderCallout = (anchor: HTMLElement, props: Record<string, unknown> = {}) => render(
  <LocaleProvider initialLocale="en">
    <HintCallout
      anchor={anchor}
      title="Relays are communities"
      body="Each one holds its own channels."
      onDismiss={vi.fn()}
      onMuteAll={vi.fn()}
      {...props}
    />
  </LocaleProvider>,
);

beforeEach(() => {
  document.body.innerHTML = '';
  window.innerWidth = 1200;
  window.innerHeight = 800;
  // jsdom has no layout: give the card a height so the flip has something
  // to reason about.
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() { return 120; },
  });
});

describe('HintCallout', () => {
  it('renders outside the app, which clips fixed children', () => {
    // Feed notes and panes set `contain: layout paint`, which makes them the
    // containing block for `position: fixed` — a callout rendered inside one
    // is laid out against the card and clipped by it.
    renderCallout(anchorAt({}));
    const card = screen.getByTestId('hint-callout');
    expect(card.parentElement).toBe(document.body);
    // The class, not computed style: jsdom loads no stylesheet.
    expect(card.className).toContain('fixed');
  });

  it('sits below its control when there is room', () => {
    renderCallout(anchorAt({ top: 100, bottom: 130 }));
    const card = screen.getByTestId('hint-callout');
    expect(card).toHaveAttribute('data-placement', 'below');
    expect(card.style.top).toBe('140px');
  });

  it('flips above when the control is near the bottom', () => {
    window.innerHeight = 200;
    renderCallout(anchorAt({ top: 150, bottom: 180 }));
    expect(screen.getByTestId('hint-callout')).toHaveAttribute('data-placement', 'above');
  });

  it('stays on screen for a control against the right edge', () => {
    renderCallout(anchorAt({ left: 1180, right: 1200, width: 20 }));
    const left = Number.parseInt(screen.getByTestId('hint-callout').style.left, 10);
    expect(left).toBeGreaterThanOrEqual(8);
    expect(left + 264).toBeLessThanOrEqual(1200 - 8 + 1);
  });

  it('stays on screen for a control against the left edge', () => {
    renderCallout(anchorAt({ left: 0, right: 20, width: 20 }));
    expect(Number.parseInt(screen.getByTestId('hint-callout').style.left, 10))
      .toBeGreaterThanOrEqual(8);
  });

  it('follows its control on scroll rather than closing', () => {
    // AnchoredMenu closes on reflow because a drifting dropdown is worse
    // than one that shuts. A hint has to keep pointing at its control.
    const anchor = anchorAt({ top: 100, bottom: 130 });
    renderCallout(anchor);
    expect(screen.getByTestId('hint-callout').style.top).toBe('140px');

    anchor.getBoundingClientRect = () => ({
      top: 300, bottom: 330, left: 100, right: 140, width: 40, height: 30,
      x: 100, y: 300, toJSON: () => ({}),
    }) as DOMRect;
    fireEvent.scroll(window);

    expect(screen.getByTestId('hint-callout')).toBeInTheDocument();
    expect(screen.getByTestId('hint-callout').style.top).toBe('340px');
  });

  it('is not dismissed by clicking elsewhere', () => {
    // Ignoring a hint must not count as reading it.
    const onDismiss = vi.fn();
    renderCallout(anchorAt({}), { onDismiss });
    fireEvent.pointerDown(document.body);
    fireEvent.click(document.body);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('dismisses on Got it and on Escape', () => {
    const onDismiss = vi.fn();
    const { unmount } = renderCallout(anchorAt({}), { onDismiss });
    fireEvent.click(screen.getByTestId('hint-dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    unmount();

    renderCallout(anchorAt({}), { onDismiss });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  it('offers a way to turn them all off', () => {
    const onMuteAll = vi.fn();
    renderCallout(anchorAt({}), { onMuteAll });
    fireEvent.click(screen.getByTestId('hint-mute'));
    expect(onMuteAll).toHaveBeenCalled();
  });

  it('is announced as a dialog with its own title', () => {
    renderCallout(anchorAt({}));
    expect(screen.getByRole('dialog', { name: 'Relays are communities' })).toBeInTheDocument();
  });
});

describe('reading as an overlay', () => {
  it('dims the page behind it', () => {
    // Without this the card landed on the heading below the header and the
    // page looked mis-rendered — the first tip clipped the pack title under
    // "Find people to follow".
    renderCallout(anchorAt({}));
    expect(screen.getByTestId('hint-scrim')).toBeInTheDocument();
  });

  it('sits above the scrim, not under it', () => {
    renderCallout(anchorAt({}));
    const scrim = Number.parseInt(screen.getByTestId('hint-scrim').className.match(/z-\[(\d+)\]/)![1], 10);
    const card = Number.parseInt(screen.getByTestId('hint-callout').className.match(/z-\[(\d+)\]/)![1], 10);
    expect(card).toBeGreaterThan(scrim);
  });

  it('dismisses when the page behind it is clicked', () => {
    const onDismiss = vi.fn();
    renderCallout(anchorAt({}), { onDismiss });
    fireEvent.click(screen.getByTestId('hint-scrim'));
    expect(onDismiss).toHaveBeenCalled();
  });
});
