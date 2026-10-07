import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import { useHintsStore } from '@/store/hints';

vi.mock('@/utils/hints/registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/hints/registry')>();
  const HINTS = [
    { id: 'first', surface: 'server', anchor: 'a-first', titleKey: 'shell.hints.gotIt', bodyKey: 'shell.hints.dismissAll', order: 10 },
    { id: 'second', surface: 'server', anchor: 'a-second', titleKey: 'shell.hints.replay', bodyKey: 'shell.hints.dismissAll', order: 20 },
    { id: 'desk', surface: 'server', anchor: 'a-desk', titleKey: 'shell.hints.gotIt', bodyKey: 'shell.hints.dismissAll', shell: 'desktop', order: 30 },
    { id: 'elsewhere', surface: 'feed', anchor: 'a-feed', titleKey: 'shell.hints.gotIt', bodyKey: 'shell.hints.dismissAll', order: 10 },
  ] as typeof import('@/constants/hints/registry').HINTS;
  return {
    ...actual,
    HINTS,
    hintsForSurface: (surface: string, shell: string) => HINTS
      .filter((h) => h.surface === surface && (!h.shell || h.shell === shell))
      .sort((a, b) => a.order - b.order),
    hintForAnchor: (anchor: string) => HINTS.find((h) => h.anchor === anchor),
  };
});

import HintHost from '@/components/hints/HintHost';

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
  vi.useRealTimers();
});

/**
 * The negative cases below assert that nothing renders, and "nothing yet" is
 * not "nothing": the host keeps looking for its anchor every 400 ms for six
 * attempts (LOOKUP_INTERVAL_MS * LOOKUP_ATTEMPTS in HintHost.tsx). A 50 ms
 * real-time nap only ever witnessed the first look, and under CPU contention
 * not even that. Under fake timers we walk past every attempt, so "no
 * callout" means the host gave up, not that we checked early.
 */
const LOOKUP_WINDOW_MS = 400 * 6 + 1;

function ownTheClock() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
}

async function exhaustLookups() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(LOOKUP_WINDOW_MS);
  });
}

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
    ownTheClock();
    useHintsStore.setState({ seen: ['first', 'second', 'desk'], muted: false });
    renderHost({ surface: 'server' });
    await exhaustLookups();
    expect(screen.queryByTestId('hint-callout')).not.toBeInTheDocument();
  });

  it('never points at a control that is not on screen', async () => {
    // The anchors are absent entirely - a hint that cannot be aimed must
    // not render as a card floating in the corner.
    ownTheClock();
    renderHost({ surface: 'server' }, false);
    await exhaustLookups();
    expect(screen.queryByTestId('hint-callout')).not.toBeInTheDocument();
  });

  it('skips hints belonging to the other shell', async () => {
    ownTheClock();
    useHintsStore.setState({ seen: ['first', 'second'], muted: false });
    renderHost({ surface: 'server', shell: 'mobile' });
    await exhaustLookups();
    // 'desk' is desktop-only, so a phone has nothing left to say here.
    expect(screen.queryByTestId('hint-callout')).not.toBeInTheDocument();
  });

  it('shows nothing when there is no surface', async () => {
    ownTheClock();
    renderHost({ surface: null });
    await exhaustLookups();
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
