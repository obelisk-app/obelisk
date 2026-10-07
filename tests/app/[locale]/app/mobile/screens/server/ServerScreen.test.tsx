import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { BRIDGE_MOCK_RELAY } from '@tests/support/mocks/nostr-bridge';
import type { ChannelLayout } from '@/services/relay/channel-layout';
import { ServerScreen } from '@/app/[locale]/app/mobile/screens/server/ServerScreen';
import { group, message } from '@tests/app/[locale]/app/mobile/mobile-fixtures';

const operator = vi.hoisted(() => ({
  value: {
    operatorPubkey: null as string | null,
    isRelayOperator: false,
    layout: { categories: [], channels: [], updatedAt: 0 } as ChannelLayout,
    branding: { name: '', icon: '', banner: '', description: '', updatedAt: 0 },
    emojiSet: { title: '', emojis: [], updatedAt: 0 },
    relayRoles: { roles: [], assignments: [], updatedAt: 0 },
  },
}));
vi.mock('@/hooks/relay/operator/useRelayOperatorData', () => ({ useRelayOperatorData: () => operator.value }));
vi.mock('@/hooks/relay/info/useRelayHeaderInfo', () => ({ useRelayHeaderInfo: () => ({ name: 'Info Name', icon: null }) }));
vi.mock('@/app/[locale]/app/mobile/rail/MobileServerRail', () => ({
  MobileServerRail: (p: { onSelectRelay: (u: string) => void; onAddRelay: () => void; onLongPress: (i: { url: string; label: string; iconUrl: string | null }) => void }) => (
    <div>
      <button data-testid="rail-same" onClick={() => p.onSelectRelay(`${BRIDGE_MOCK_RELAY}/`)} />
      <button data-testid="rail-other" onClick={() => p.onSelectRelay('wss://other.test')} />
      <button data-testid="rail-add" onClick={p.onAddRelay} />
      <button data-testid="rail-hold" onClick={() => p.onLongPress({ url: 'wss://other.test', label: 'Other', iconUrl: null })} />
    </div>
  ),
}));
vi.mock('@/app/[locale]/app/mobile/rail/MobileServerBanner', () => ({
  MobileServerBanner: (p: { label: string; onSearch: () => void; onCreateChannel: () => void; onOpenMenu: () => void }) => (
    <div data-testid="banner" data-label={p.label}>
      <button data-testid="banner-search" onClick={p.onSearch} />
      <button data-testid="banner-create" onClick={p.onCreateChannel} />
      <button data-testid="banner-menu" onClick={p.onOpenMenu} />
    </div>
  ),
}));
vi.mock('@/app/[locale]/app/mobile/sheets/relay/AddRelaySheet', () => ({ AddRelaySheet: ({ close }: { close: () => void }) => <button data-testid="add-relay-sheet" onClick={close} /> }));
vi.mock('@/app/[locale]/app/mobile/sheets/channel/CreateChannelSheet', () => ({
  CreateChannelSheet: (p: { relayLabel: string; onCreated: (id: string) => void }) => <button data-testid="create-sheet" data-label={p.relayLabel} onClick={() => p.onCreated('new-id')} />,
}));
vi.mock('@/app/[locale]/app/mobile/sheets/relay/RelayMenuSheet', () => ({
  RelayMenuSheet: (p: { relayUrl: string; label: string; isAdmin: boolean; close: () => void }) => (
    <button data-testid="relay-menu" data-url={p.relayUrl} data-label={p.label} data-admin={String(p.isAdmin)} onClick={p.close} />
  ),
}));

const GROUPS = [
  group({ id: 'a', name: 'alpha' }),
  group({ id: 'b', name: 'beta' }),
  group({ id: 'f', name: 'forum', kind: 'forum' }),
  group({ id: 't1', name: 'thread one', parent: 'f' }),
  group({ id: 'o', name: 'orphan', parent: 'missing' }),
];

function mount(methods: Record<string, unknown> = {}) {
  const go = vi.fn();
  const selectGroup = vi.fn();
  renderWithBridge(
    <ServerScreen go={go} selectGroup={selectGroup} />,
    fakeBridge({ groups: GROUPS, childrenByParent: { f: ['t1'] }, messagesByGroup: { t1: [message({ id: 'm' })] } }, methods as never),
  );
  return { go, selectGroup };
}

const names = () => Array.from(document.querySelectorAll('.channel-list .ch-name')).map((n) => n.textContent);

beforeEach(() => {
  localStorage.clear();
  operator.value = { ...operator.value, isRelayOperator: false, layout: { categories: [], channels: [], updatedAt: 0 }, branding: { ...operator.value.branding, name: '' } };
});

describe('ServerScreen (phone)', () => {
  it('lists the root channels, an orphan included, and a forum with its threads expanded', () => {
    mount();
    expect(names()).toEqual(['alpha', 'beta', 'forum', 'thread one', 'orphan']);
  });

  it('collapses a forum from its chevron', () => {
    mount();
    fireEvent.click(document.querySelector('.ch-chevron-btn')!);
    expect(names()).toEqual(['alpha', 'beta', 'forum', 'orphan']);
  });

  it('groups channels under the layout categories, each collapsible, the rest under a count', () => {
    operator.value = {
      ...operator.value,
      layout: {
        categories: [{ id: 'c1', name: 'Main', position: 0 }],
        channels: [{ id: 'b', categoryId: 'c1', position: 0 }],
        updatedAt: 1,
      } as ChannelLayout,
    };
    mount();
    const labels = Array.from(document.querySelectorAll('.channel-section-label')).map((n) => n.textContent);
    expect(labels[0]).toContain('Main · 1');
    expect(labels).toHaveLength(2);
    expect(names()[0]).toBe('beta');
    fireEvent.click(document.querySelectorAll('.channel-section-label')[0]);
    expect(names()).not.toContain('beta');
    fireEvent.click(document.querySelectorAll('.channel-section-label')[1]);
    expect(names()).toEqual([]);
  });

  it('opens a channel with its kind', () => {
    const { selectGroup } = mount();
    fireEvent.click(screen.getByText('alpha'));
    expect(selectGroup).toHaveBeenCalledWith('a', 'text');
    fireEvent.click(screen.getByText('thread one'));
    expect(selectGroup).toHaveBeenCalledWith('t1', 'text');
  });

  it('switches relay only to a different one', async () => {
    const switchRelay = vi.fn().mockResolvedValue(undefined);
    mount({ switchRelay });
    fireEvent.click(screen.getByTestId('rail-same'));
    fireEvent.click(screen.getByTestId('rail-other'));
    await vi.waitFor(() => expect(switchRelay).toHaveBeenCalledWith('wss://other.test'));
    expect(switchRelay).toHaveBeenCalledTimes(1);
  });

  it('names the space after the branding, else the NIP-11 document', () => {
    mount();
    expect(screen.getByTestId('banner')).toHaveAttribute('data-label', 'Info Name');
  });

  it('opens the add-relay, new-channel and relay-menu sheets', () => {
    const { selectGroup, go } = mount();
    fireEvent.click(screen.getByTestId('rail-add'));
    fireEvent.click(screen.getByTestId('add-relay-sheet'));
    expect(screen.queryByTestId('add-relay-sheet')).toBeNull();
    fireEvent.click(screen.getByTestId('banner-create'));
    expect(screen.getByTestId('create-sheet')).toHaveAttribute('data-label', 'Info Name');
    fireEvent.click(screen.getByTestId('create-sheet'));
    expect(selectGroup).toHaveBeenCalledWith('new-id', 'text');
    fireEvent.click(screen.getByTestId('banner-menu'));
    expect(screen.getByTestId('relay-menu')).toHaveAttribute('data-url', BRIDGE_MOCK_RELAY);
    expect(screen.getByTestId('relay-menu')).toHaveAttribute('data-label', 'Info Name');
    fireEvent.click(screen.getByTestId('relay-menu'));
    fireEvent.click(screen.getByTestId('rail-hold'));
    expect(screen.getByTestId('relay-menu')).toHaveAttribute('data-url', 'wss://other.test');
    fireEvent.click(screen.getByTestId('banner-search'));
    expect(go).toHaveBeenCalledWith('search');
  });

  it('shows the empty state when the relay has no channels', () => {
    renderWithBridge(<ServerScreen go={vi.fn()} selectGroup={vi.fn()} />, fakeBridge({ groups: [] }));
    expect(document.querySelectorAll('.channel-list .ch-row')).toHaveLength(0);
    expect(document.querySelector('.channel-list')?.children.length).toBeGreaterThan(0);
  });
});
