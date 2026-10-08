import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MobileScreensHost } from '@/app/[locale]/app/mobile/carousel/MobileScreensHost';
import { initialNav } from '@/constants/shell/mobile';
import type { MobileScreenProps } from '@/hooks/shell/mobile/nav/usePhoneShell';
import type { NavState } from '@/utils/shell/mobile/url-state';
import { neighborsFor } from '@/utils/shell/mobile/swipe-nav';

vi.mock('@/app/[locale]/app/mobile/carousel/TopLevelScreen', () => ({
  TopLevelScreen: ({ screen: name }: { screen: string }) => {
    const [text, setText] = useState('');
    return <input data-testid={name} value={text} onChange={(event) => setText(event.target.value)} />;
  },
}));
vi.mock('@/app/[locale]/app/mobile/carousel/MobileScreenBody', () => ({ MobileScreenBody: () => <div data-testid="overlay" /> }));
vi.mock('@/app/[locale]/app/mobile/sheets/message/MessageActionsSheet', () => ({ MessageActionsSheet: () => null }));
const props = {
  hostRef: { current: null }, dragLayerRef: { current: null }, screenProps: {} as MobileScreenProps,
  slideClass: '', closeSheet: vi.fn(), openZap: vi.fn(),
};
const at = (name: NavState['screen']): NavState => ({ ...initialNav, screen: name });
const host = (nav: NavState, dragging = false) => <MobileScreensHost {...props} nav={nav} isDragging={dragging} dragNeighbors={neighborsFor(nav)} />;

describe('persistent mobile carousel', () => {
  it('does not mount hidden feeds initially, mounts neighbors for a swipe, and preserves their state after switching', () => {
    const view = render(host(at('server')));
    expect(screen.queryByTestId('feed')).toBeNull();
    expect(screen.queryByTestId('settings-profile')).toBeNull();
    expect(view.container.querySelectorAll('.drag-slot')).toHaveLength(5);
    view.rerender(host(at('server'), true));
    const feed = screen.getByTestId('feed');
    fireEvent.change(feed, { target: { value: 'Keep my draft' } });
    view.rerender(host(at('feed')));
    expect(screen.getByTestId('feed')).toBe(feed);
    view.rerender(host(at('inbox')));
    expect(screen.getByTestId('feed')).toHaveValue('Keep my draft');
    expect(screen.queryByTestId('settings-profile')).toBeNull();
    view.rerender(host(at('feed')));
    expect(screen.getByTestId('feed')).toBe(feed);
  });
  it('preserves the parent tab while opening a sub-screen', () => {
    const view = render(host(at('server')));
    const server = screen.getByTestId('server');
    view.rerender(host({ ...at('channel'), groupId: 'channel' }));
    expect(screen.getByTestId('server')).toBe(server);
    expect(screen.getByTestId('overlay')).toBeInTheDocument();
    expect(screen.queryByTestId('feed')).toBeNull();
  });
});
