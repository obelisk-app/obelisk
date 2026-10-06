import { render } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Switching channels must never draw the previous channel's messages under
 * the new channel.
 *
 * The bug: a channel pane holds its message list in component state (that is
 * what the bridge's subscription hook does) and only refreshes it in an
 * effect after the channel id changes. If the pane is reused across the
 * switch, the first render with the new id still holds the old list. Both
 * shells now key the pane by channel id so a switch mounts a fresh one.
 *
 * The real panes are replaced by a stand-in that holds its list exactly that
 * way and records every render, so this checks the mount points (whatever
 * the subscription hook does), not the hook.
 */

const MESSAGES: Record<string, string[]> = {
  alpha: ['alpha says hi', 'alpha again'],
  beta: ['beta says hi'],
};

const renders = vi.hoisted(() => [] as Array<{ groupId: string; shown: string[] }>);
const mounts = vi.hoisted(() => [] as string[]);

vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock();
});

/** Replays a channel's list to the callback, the way the bridge's stores do. */
function subscribeMessages(groupId: string, cb: (list: string[]) => void): () => void {
  cb(MESSAGES[groupId]);
  return () => {};
}

function StalePane({ groupId }: { groupId: string }) {
  useState(() => mounts.push(groupId));
  const [shown, setShown] = useState(() => MESSAGES[groupId]);
  useEffect(() => subscribeMessages(groupId, setShown), [groupId]);
  renders.push({ groupId, shown });
  return <div data-testid="pane">{shown.join('|')}</div>;
}

vi.mock('@/app/app/panes/ChatPanel', () => ({ ChatLayout: StalePane }));
vi.mock('@/app/app/mobile/screens/ChannelScreen', () => ({ ChannelScreen: StalePane }));

import { DesktopMain } from '@/app/app/shell/DesktopMain';
import { renderScreenBody, type MobileScreenProps } from '@/app/app/mobile/MobileScreens';
import type { NavState } from '@/utils/shell/mobile/url-state';
import type { FeedPaneControls } from '@/hooks/app/shell/useDesktopLayout';
import type { View } from '@/utils/shell/view';
import { LocaleProvider } from '@/i18n/context';

/** Every render that showed a message belonging to another channel. */
function staleRenders() {
  return renders.filter((r) => r.shown.some((m) => !MESSAGES[r.groupId].includes(m)));
}

function desktop(view: View) {
  return (
    <LocaleProvider initialLocale="en">
      <DesktopMain
        view={view}
        setView={() => {}}
        showMembers={false}
        onToggleMembers={() => {}}
        pendingMessageId={null}
        onConsumePendingMessageId={() => {}}
        leaveDms={() => {}}
        feed={{} as FeedPaneControls}
        onOpenProfile={() => {}}
        openThread={() => {}}
        openArticle={() => {}}
      />
    </LocaleProvider>
  );
}

const NAV: NavState = {
  screen: 'channel', groupId: null, dmPeer: null, profilePubkey: null,
  forumGroupId: null, baseScreen: null, msgContext: null, parentScreen: null,
};
const noop = () => {};
const PROPS = new Proxy({ t: (k: string) => k, dmOptInEnabled: true, myFollows: [] }, {
  get: (target, key) => (key in target ? target[key as keyof typeof target] : noop),
}) as unknown as MobileScreenProps;

function phone(nav: Partial<NavState>) {
  return <>{renderScreenBody({ ...NAV, ...nav }, PROPS)}</>;
}

describe('switching channels', () => {
  beforeEach(() => {
    renders.length = 0;
    mounts.length = 0;
  });

  it('desktop: the new channel never renders with the old channel\'s messages', () => {
    const { rerender, getByTestId } = render(desktop({ kind: 'group', groupId: 'alpha' }));
    rerender(desktop({ kind: 'group', groupId: 'beta' }));
    expect(getByTestId('pane').textContent).toBe('beta says hi');
    expect(renders.some((r) => r.groupId === 'beta')).toBe(true);
    expect(staleRenders()).toEqual([]);
    expect(mounts).toEqual(['alpha', 'beta']);
  });

  it('phone: the new channel never renders with the old channel\'s messages', () => {
    const { rerender, getByTestId } = render(phone({ groupId: 'alpha' }));
    rerender(phone({ groupId: 'beta' }));
    expect(getByTestId('pane').textContent).toBe('beta says hi');
    expect(renders.some((r) => r.groupId === 'beta')).toBe(true);
    expect(staleRenders()).toEqual([]);
    expect(mounts).toEqual(['alpha', 'beta']);
  });

  it('phone: opening the message sheet over a channel keeps that channel\'s pane mounted', () => {
    const { rerender } = render(phone({ groupId: 'alpha' }));
    rerender(phone({ groupId: 'alpha', screen: 'msg-actions', baseScreen: 'channel' }));
    // Same instance re-rendered, not a fresh mount: the sheet must not wipe
    // the channel's local state (a half-written reply, say).
    expect(mounts).toEqual(['alpha']);
    expect(staleRenders()).toEqual([]);
  });
});
