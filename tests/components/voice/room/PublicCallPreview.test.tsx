import { act, cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicCallPreview } from '@/components/voice/room/PublicCallPreview';
import { GroupNode } from '@/app/[locale]/app/panes/sidebar/GroupNode';
import { ChannelRow } from '@/app/[locale]/app/mobile/screens/server/ChannelRow';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { groupFixture, userMetadataFixture } from '@tests/support/mocks/nostr-bridge';
import type { ActiveCallInfo, JsGroup } from '@/services/nostr-bridge';

const ALICE = 'a'.repeat(64);
const BOB = 'b'.repeat(64);
const publicRoom = groupFixture({ id: 'room', kind: 'voice-sfu', isPublic: true, isHidden: false, isOpen: false });
const call = (mode: 'sfu' | 'mesh' = 'sfu'): ActiveCallInfo => ({
  hostPubkey: 'host', mode, status: 'active', participantCount: 2,
  participantPubkeys: [ALICE, BOB], createdAt: 1, expiresAt: Math.floor(Date.now() / 1000) + 60,
});

function bridge(group: JsGroup = publicRoom, active = call()) {
  const methods = {
    subscribeUserMetadata: vi.fn(), subscribeMembers: vi.fn(), subscribeAdmins: vi.fn(),
    subscribeFilterWatched: vi.fn(), publishEvent: vi.fn(), ensureUserMetadata: vi.fn(),
  };
  const fake = fakeBridge({
    myPubkey: null, groups: [group], activeCallByChannel: { room: active },
    userMetadata: { [ALICE]: userMetadataFixture({ pubkey: ALICE, displayName: 'Alice' }) },
  }, methods);
  return { fake, methods };
}

afterEach(cleanup);

describe('public call preview', () => {
  it.each(['sfu', 'mesh'] as const)('shows advertised %s identities with cached names and no channel/profile requests or timers', (mode) => {
    const { fake, methods } = bridge({ ...publicRoom, kind: mode === 'mesh' ? 'voice' : 'voice-sfu' }, call(mode));
    const interval = vi.spyOn(globalThis, 'setInterval');
    renderWithBridge(<PublicCallPreview groupId="room" menu />, fake);
    expect(screen.getAllByTestId('passive-call-participant')).toHaveLength(2);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    for (const method of Object.values(methods)) expect(method).not.toHaveBeenCalled();
    expect(interval).not.toHaveBeenCalled();
    interval.mockRestore();
  });

  it.each(['private', 'hidden', 'text', 'missing'] as const)('never reveals the roster for a %s channel', (kind) => {
    const group = { ...publicRoom, ...(kind === 'private' ? { isPublic: false } : kind === 'hidden' ? { isHidden: true } : kind === 'text' ? { kind: 'text' as const } : { id: 'different' }) };
    const { fake } = bridge(group);
    renderWithBridge(<PublicCallPreview groupId="room" menu />, fake);
    expect(screen.queryByTestId('passive-call-roster')).toBeNull();
  });

  it('keeps an advertised count when identities are unavailable and never fetches a roster', () => {
    const { fake, methods } = bridge(publicRoom, { ...call(), participantCount: 4, participantPubkeys: undefined });
    renderWithBridge(<PublicCallPreview groupId="room" menu />, fake);
    expect(screen.getByTestId('passive-call-roster')).toBeInTheDocument();
    expect(screen.queryByTestId('passive-call-participant')).toBeNull();
    expect(screen.getByTestId('passive-call-roster').textContent).toContain('4');
    for (const method of Object.values(methods)) expect(method).not.toHaveBeenCalled();
  });

  it('bounds faces and reflects departures from the shared presence map', () => {
    const keys = Array.from({ length: 10 }, (_, index) => index.toString(16).repeat(64));
    const { fake } = bridge(publicRoom, { ...call(), participantCount: 10, participantPubkeys: keys });
    renderWithBridge(<PublicCallPreview groupId="room" menu />, fake);
    expect(screen.getAllByTestId('passive-call-participant')).toHaveLength(6);
    expect(screen.getByText('+4 more')).toBeInTheDocument();
    act(() => fake.stores.activeCallByChannel.set({ room: { ...call(), participantCount: 1, participantPubkeys: [ALICE] } }));
    expect(screen.getAllByTestId('passive-call-participant')).toHaveLength(1);
    act(() => fake.stores.activeCallByChannel.set({}));
    expect(screen.queryByTestId('passive-call-roster')).toBeNull();
  });

  it('keeps the default card presentation for room and chat previews', () => {
    const { fake } = bridge();
    renderWithBridge(<PublicCallPreview groupId="room" />, fake);
    expect(screen.getByText('SFU')).toBeInTheDocument();
    expect(screen.getAllByTestId('passive-call-participant')[0]).toHaveClass('rounded-full');
  });

  it('truncates long cached names and keeps a fallback for missing profiles', () => {
    const { fake } = bridge();
    const name = 'A very long participant display name that must fit a narrow menu';
    fake.stores.userMetadata.set({ [ALICE]: userMetadataFixture({ pubkey: ALICE, displayName: name }) });
    renderWithBridge(<PublicCallPreview groupId="room" menu />, fake);
    expect(screen.getByText(name)).toHaveClass('truncate');
    expect(screen.getAllByTestId('passive-call-participant')[1]).toHaveTextContent('npub');
  });

  it('does not carry a roster into a different relay with the same private channel id', () => {
    const { fake } = bridge();
    renderWithBridge(<PublicCallPreview groupId="room" menu />, fake);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    act(() => {
      fake.stores.currentRelayUrl.set('wss://other.example');
      fake.stores.groups.set([]);
      fake.stores.activeCallByChannel.set({});
    });
    expect(screen.queryByTestId('passive-call-roster')).toBeNull();
    act(() => {
      fake.stores.groups.set([{ ...publicRoom, isPublic: false }]);
      fake.stores.activeCallByChannel.set({ room: call() });
    });
    expect(screen.queryByTestId('passive-call-roster')).toBeNull();
  });

  it.each(['desktop', 'mobile'] as const)('shows the preview in the %s channel entry before navigating or joining', (surface) => {
    const { fake, methods } = bridge();
    const select = vi.fn();
    renderWithBridge(surface === 'desktop'
      ? <GroupNode group={publicRoom} depth={0} childrenByParent={{}} groupsById={{ room: publicRoom }} view={{ kind: 'empty' }} onSelect={select} />
      : <ChannelRow group={publicRoom} live onClick={select} />, fake);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'In Call' });
    expect(list.children).toHaveLength(2);
    expect(screen.getAllByTestId('passive-call-participant')[0]).not.toHaveClass('rounded-full');
    expect(screen.queryByText('SFU')).toBeNull();
    expect(select).not.toHaveBeenCalled();
    expect(methods.subscribeFilterWatched).not.toHaveBeenCalled();
    expect(methods.subscribeMembers).not.toHaveBeenCalled();
    expect(methods.subscribeAdmins).not.toHaveBeenCalled();
    expect(methods.ensureUserMetadata).not.toHaveBeenCalled();
  });
});
