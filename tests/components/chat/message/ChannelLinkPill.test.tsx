import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { LocaleProvider } from '@tests/support/intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import type { JsGroup } from '@/services/nostr-bridge';
import ChannelLinkPill from '@/components/chat/message/ChannelLinkPill';


/** The component reads its copy from the dictionary, so it needs a provider. */
const Wrapper = ({ children }: { children: ReactNode }) => <LocaleProvider initialLocale="en">{children}</LocaleProvider>;
const renderLocalized = (ui: ReactElement) => render(ui, { wrapper: Wrapper });
describe('ChannelLinkPill', () => {
  const originalPush = window.history.pushState;

  beforeEach(() => {
    window.history.pushState = vi.fn();
  });

  afterEach(() => {
    window.history.pushState = originalPush;
    vi.restoreAllMocks();
  });

  it('uses the relay channel slug directly', () => {
    renderLocalized(<ChannelLinkPill slug="general" href="/app?c=general" />);
    expect(screen.getByTestId('channel-link-pill')).toHaveTextContent('#general');
  });

  it('resolves channel names and updates when metadata arrives or changes', () => {
    const bridge = fakeBridge({ currentRelayUrl: 'wss://relay.example' });
    renderWithBridge(<ChannelLinkPill slug="channel-id" href="/app?c=channel-id&relay=RELAY.example%2F" />, bridge);
    expect(screen.getByTestId('channel-link-pill')).toHaveTextContent('#channel-id');

    act(() => bridge.stores.groups.set([{ id: 'channel-id', name: 'General chat' } as JsGroup]));
    expect(screen.getByTestId('channel-link-pill')).toHaveTextContent('#General chat');
    expect(screen.getByTestId('channel-link-pill').title).toContain('General chat');
    expect(screen.getByTestId('channel-link-pill')).toHaveAttribute('href', '/app?c=channel-id&relay=RELAY.example%2F');

    act(() => bridge.stores.groups.set([{ id: 'channel-id', name: 'Renamed' } as JsGroup]));
    expect(screen.getByTestId('channel-link-pill')).toHaveTextContent('#Renamed');
    act(() => bridge.stores.groups.set([{ id: 'channel-id', name: '  ' } as JsGroup]));
    expect(screen.getByTestId('channel-link-pill')).toHaveTextContent('#channel-id');
  });

  it.each([
    { messageId: undefined, postId: undefined, prefix: '#' },
    { messageId: 'message', postId: undefined, prefix: '↩ ' },
    { messageId: undefined, postId: 'post', prefix: '📋 ' },
  ])('uses the name for links without a relay and prefix $prefix', ({ prefix, ...target }) => {
    const bridge = fakeBridge({ groups: [{ id: 'channel-id', name: 'General chat' } as JsGroup] });
    renderWithBridge(<ChannelLinkPill slug="channel-id" href="/app?c=channel-id" {...target} />, bridge);
    expect(screen.getByTestId('channel-link-pill')).toHaveTextContent(`${prefix}General chat`);
  });

  it('does not use a name from another relay for the same channel ID', () => {
    const bridge = fakeBridge({ currentRelayUrl: 'wss://relay.example', groups: [{ id: 'general', name: 'Local name' } as JsGroup] });
    renderWithBridge(<ChannelLinkPill slug="general" href="/app?c=general&relay=other.example" />, bridge);
    expect(screen.getByTestId('channel-link-pill')).toHaveTextContent('#general');
  });

  it('keeps post and message link prefixes', () => {
    const { rerender } = renderLocalized(
      <ChannelLinkPill slug="forum" postId="post" href="/app?c=forum&p=post" />,
    );
    expect(screen.getByTestId('channel-link-pill')).toHaveTextContent('📋 forum');

    rerender(<ChannelLinkPill slug="general" messageId="message" href="/app?c=general&m=message" />);
    expect(screen.getByTestId('channel-link-pill')).toHaveTextContent('↩ general');
  });

  it('navigates without remounting unless a modifier key is held', () => {
    const listener = vi.fn();
    window.addEventListener('popstate', listener);
    renderLocalized(<ChannelLinkPill slug="general" href="/app?c=general" />);

    fireEvent.click(screen.getByTestId('channel-link-pill'));
    expect(window.history.pushState).toHaveBeenCalledWith(null, '', '/app?c=general');
    expect(listener).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByTestId('channel-link-pill'), { metaKey: true });
    expect(window.history.pushState).toHaveBeenCalledOnce();
    window.removeEventListener('popstate', listener);
  });
});
