import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { BRIDGE_MOCK_RELAY, groupFixture } from '@tests/support/mocks/nostr-bridge';
import { EMPTY_LAYOUT } from '@/constants/relay/channel-layout';

vi.mock('@/hooks/shell/panes/sidebar/useSidebarData', () => ({
  useSidebarOperatorData: () => ({ layout: EMPTY_LAYOUT, isRelayOperator: false }),
  useGroupWotDistances: () => ({}),
}));

import { useSidebar } from '@/hooks/shell/panes/sidebar/useSidebar';

const top = groupFixture({ id: 'top' });
const child = groupFixture({ id: 'child', parent: 'top' });

function setup(seed: Record<string, unknown> = {}) {
  const setView = vi.fn();
  const view = renderHook(() => useSidebar(BRIDGE_MOCK_RELAY, setView), {
    wrapper: bridgeWrapper(fakeBridge({ groups: [top, child], ...seed })),
  });
  return { ...view, setView };
}

describe('useSidebar', () => {
  it('roots the layout at the top-level channels', () => {
    const { result } = setup();
    expect(result.current.roots).toEqual([top]);
    expect(result.current.laidOut).toEqual({ categories: [], uncategorized: ['top'] });
    expect(result.current.groupsById).toEqual({ top, child });
    expect(result.current.channelsVisible).toBe(true);
  });

  it('channels are not visible without relay access', () => {
    expect(setup({ relayAccess: {} }).result.current.channelsVisible).toBe(false);
  });

  it('selecting a channel opens it; the settings menu opens and closes', () => {
    const { result, setView } = setup();
    result.current.selectGroup('top');
    expect(setView).toHaveBeenCalledWith({ kind: 'group', groupId: 'top' });
    act(() => result.current.openSettings());
    expect(result.current.settingsOpen).toBe(true);
    act(() => result.current.closeSettings());
    expect(result.current.settingsOpen).toBe(false);
  });
});
