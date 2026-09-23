import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/context';
import { useHintsStore } from '@/store/hints';

vi.mock('@/lib/hints/registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/hints/registry')>();
  const HINTS = [
    { id: 'first', surface: 'server', anchor: 'a-first', titleKey: 'hints.gotIt', bodyKey: 'hints.dismissAll', order: 10 },
    { id: 'second', surface: 'server', anchor: 'a-second', titleKey: 'hints.replay', bodyKey: 'hints.dismissAll', order: 20 },
    { id: 'desk', surface: 'server', anchor: 'a-desk', titleKey: 'hints.gotIt', bodyKey: 'hints.dismissAll', shell: 'desktop', order: 30 },
    { id: 'elsewhere', surface: 'feed', anchor: 'a-feed', titleKey: 'hints.gotIt', bodyKey: 'hints.dismissAll', order: 10 },
  ] as typeof actual.HINTS;
  return {
    ...actual,
    HINTS,
    hintsForSurface: (surface: string, shell: string) => HINTS
      .filter((h) => h.surface === surface && (!h.shell || h.shell === shell))
      .sort((a, b) => a.order - b.order),
    hintForAnchor: (anchor: string) => HINTS.find((h) => h.anchor === anchor),
  };
});

import HintHost from './HintHost';

/** The real controls a hint points at. */
function Anchors() {
  return (
    <div>
      <button type="button" data-tour="a-first">first</button>
      <button type="button" data-tour="a-second">second</button>
      <button type="button" data-tour="a-desk">desk</button>
    </div>
  );
}

const renderHost = (props: { surface: string | null; shell?: 'desktop' | 'mobile' }, anchors = true) => render(
  <LocaleProvider initialLocale="en">
    {anchors && <Anchors />}
    <HintHost surface={props.surface as never} shell={props.shell ?? 'desktop'} />
  </LocaleProvider>,
);

beforeEach(() => {
  window.localStorage.clear();
  useHintsStore.setState({ seen: [], muted: false });
  // jsdom reports offsetParent as null for everything; the host uses it to
  // skip anchors that aren't laid out, so give the tree a real one.
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get() { return document.body; },
  });
});

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'offsetParent');
});

describe('HintHost', () => {
  it('shows the first unseen hint for the surface, and only one', async () => {
    renderHost({ surface: 'server' });
    const callout = await screen.findByTestId('hint-callout');
    expect(callout).toHaveTextContent('Got it');
    expect(screen.getAllByTestId('hint-callout')).toHaveLength(1);
  });

  it('advances to the next one when dismissed', async () => {
    renderHost({ surface: 'server' });
    await screen.findByTestId('hint-callout');

    fireEvent.click(screen.getByTestId('hint-dismiss'));
    await waitFor(() => expect(screen.getByTestId('hint-callout'))
      .toHaveTextContent('Show tips again'));
    expect(useHintsStore.getState().seen).toEqual(['first']);
  });

  it('goes quiet once everything here is seen', async () => {
    useHintsStore.setState({ seen: ['first', 'second', 'desk'], muted: false });
    renderHost({ surface: 'server' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByTestId('hint-callout')).not.toBeInTheDocument();
  });

  it('never points at a control that is not on screen', async () => {
    // The anchors are absent entirely — a hint that cannot be aimed must
    // not render as a card floating in the corner.
    renderHost({ surface: 'server' }, false);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByTestId('hint-callout')).not.toBeInTheDocument();
  });

  it('skips hints belonging to the other shell', async () => {
    useHintsStore.setState({ seen: ['first', 'second'], muted: false });
    renderHost({ surface: 'server', shell: 'mobile' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    // 'desk' is desktop-only, so a phone has nothing left to say here.
    expect(screen.queryByTestId('hint-callout')).not.toBeInTheDocument();
  });

  it('shows nothing when there is no surface', async () => {
    renderHost({ surface: null });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByTestId('hint-callout')).not.toBeInTheDocument();
  });

  it('counts using a control as learning it', async () => {
    // Someone who already found the button does not need to be told what
    // the button is.
    renderHost({ surface: 'server' });
    await screen.findByTestId('hint-callout');

    fireEvent.pointerDown(screen.getByText('second'));
    expect(useHintsStore.getState().seen).toContain('second');
  });

  it('stops entirely once muted', async () => {
    renderHost({ surface: 'server' });
    await screen.findByTestId('hint-callout');

    fireEvent.click(screen.getByTestId('hint-mute'));
    await waitFor(() => expect(screen.queryByTestId('hint-callout')).not.toBeInTheDocument());
    // Muting is not the same as seeing: "show tips again" must bring the
    // whole set back, not just what was left.
    expect(useHintsStore.getState().seen).toEqual([]);
  });
});
