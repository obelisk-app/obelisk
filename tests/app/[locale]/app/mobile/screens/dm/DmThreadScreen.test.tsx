import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import type { JsDirectMessage } from '@/services/nostr-bridge';
import { setPreference } from '@/services/preferences/preferences';
import { DmThreadScreen } from '@/app/[locale]/app/mobile/screens/dm/DmThreadScreen';

vi.mock('@/components/call/DmCallButtons', () => ({ DmCallButtons: () => null }));
vi.mock('@/services/chat/pq/attestations', async (orig) => ({
  ...(await orig<typeof import('@/services/chat/pq/attestations')>()),
  hasUsableKeys: vi.fn().mockResolvedValue(false),
}));

const PEER = 'c'.repeat(64);
const dm = (id: string, over: Partial<JsDirectMessage> = {}): JsDirectMessage =>
  ({ id, counterparty: PEER, outgoing: false, content: `text ${id}`, createdAt: 1_700_000_000, ...over });

beforeEach(() => setPreference('directMessagesEnabled', true));
afterEach(() => setPreference('directMessagesEnabled', false));

function mount(methods: Record<string, unknown> = {}) {
  const back = vi.fn();
  const openProfile = vi.fn();
  renderWithBridge(
    <DmThreadScreen peer={PEER} back={back} openProfile={openProfile} />,
    fakeBridge({
      dmsByPeer: {
        [PEER]: [
          dm('in1'),
          dm('out1', { outgoing: true, createdAt: 1_700_000_010 }),
          dm('pend', { outgoing: true, pending: true, createdAt: 1_700_000_020 } as never),
          dm('fail', { outgoing: true, failed: true, clientTag: 'tag-1', createdAt: 1_700_000_030 } as never),
        ],
      },
    }, methods as never),
  );
  return { back, openProfile };
}

const bubble = (id: string) => screen.getByText(`text ${id}`).closest('.dm-bubble')!;

describe('DmThreadScreen (phone)', () => {
  it('styles each bubble by direction and state, under a day divider', () => {
    mount();
    expect(document.querySelector('.day-divider')).not.toBeNull();
    expect(bubble('in1').className).toBe('dm-bubble incoming');
    expect(bubble('out1').className).toBe('dm-bubble outgoing delivered');
    expect(bubble('pend').className).toBe('dm-bubble outgoing delivered pending');
    expect(bubble('fail').className).toBe('dm-bubble outgoing delivered failed');
    expect(bubble('pend').querySelector('.dm-bubble-spinner')).not.toBeNull();
  });

  it('retries and dismisses a failed send by its client tag', () => {
    const retryDirectMessage = vi.fn().mockResolvedValue(undefined);
    const cancelPendingDirectMessage = vi.fn().mockResolvedValue(undefined);
    mount({ retryDirectMessage, cancelPendingDirectMessage });
    fireEvent.click(screen.getByTestId('mobile-dm-retry'));
    fireEvent.click(screen.getByTestId('mobile-dm-failed').querySelector('.dm-bubble-dismiss')!);
    return vi.waitFor(() => {
      expect(retryDirectMessage).toHaveBeenCalledWith(PEER, 'tag-1');
      expect(cancelPendingDirectMessage).toHaveBeenCalledWith(PEER, 'tag-1');
    });
  });

  it('opens the peer profile from the avatar and the name, and goes back', () => {
    const { back, openProfile } = mount();
    fireEvent.click(document.querySelector('.dm-header .dm-ava-list')!);
    fireEvent.click(document.querySelector('.dm-header-meta')!);
    expect(openProfile).toHaveBeenCalledTimes(2);
    expect(openProfile).toHaveBeenCalledWith(PEER);
    fireEvent.click(document.querySelector('.dm-header button')!);
    expect(back).toHaveBeenCalled();
  });
});
