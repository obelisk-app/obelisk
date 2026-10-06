/** The hook words its errors through next-intl, so it needs a provider. */
const wrapper = ({ children }: { children: ReactNode }) => <LocaleProvider initialLocale="en">{children}</LocaleProvider>;

import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { LocaleProvider } from '@tests/support/intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JsGroup } from '@/services/nostr-bridge';

const editGroupMetadata = vi.fn();
const putUser = vi.fn();
vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({
    nostrActions: {
      editGroupMetadata: (...a: unknown[]) => editGroupMetadata(...a),
      putUser: (...a: unknown[]) => putUser(...a),
    },
    useMembers: () => ['m'.repeat(64), 'a'.repeat(64)],
    useAdmins: () => ['a'.repeat(64)],
  });
});

const resolveSfuPin = vi.fn();
const fetchSfuInfo = vi.fn();
const publishSfuPin = vi.fn();
vi.mock('@/services/voice/sfu-pin', () => ({
  resolveSfuPin: (...a: unknown[]) => resolveSfuPin(...a),
  fetchSfuInfo: (...a: unknown[]) => fetchSfuInfo(...a),
  publishSfuPin: (...a: unknown[]) => publishSfuPin(...a),
}));

import { useChannelSettingsForm } from '@/hooks/chat/useChannelSettingsForm';

const GROUP: JsGroup = {
  id: 'rly/chan',
  name: 'General',
  about: 'Chat',
  picture: null,
  banner: null,
  isPublic: true,
  isHidden: false,
  isRestricted: false,
  isOpen: true,
  parent: null,
  kind: 'text',
  forumTags: [{ id: 't1', name: 'News', emoji: null, color: null }],
  topics: [],
};

afterEach(() => {
  editGroupMetadata.mockReset();
  putUser.mockReset();
  resolveSfuPin.mockReset();
  fetchSfuInfo.mockReset();
  publishSfuPin.mockReset();
});

async function mount(group: JsGroup = GROUP, onSaved = vi.fn()) {
  resolveSfuPin.mockResolvedValue(null);
  const hook = renderHook(() => useChannelSettingsForm(group, onSaved), { wrapper });
  // The SFU URL is seeded asynchronously from the pin (or the default).
  await waitFor(() => expect(hook.result.current.sfuUrl).not.toBe(''));
  return { ...hook, onSaved };
}

describe('useChannelSettingsForm: metadata', () => {
  it('seeds the fields and the access preset from the group', async () => {
    const { result } = await mount({ ...GROUP, isPublic: true, isRestricted: true });
    expect(result.current.name).toBe('General');
    expect(result.current.access).toBe('read-only');
    expect(result.current.channelKind).toBe('text');
    expect(result.current.forumTags).toEqual(GROUP.forumTags);
    expect(result.current.allPubkeys).toEqual(['a'.repeat(64), 'm'.repeat(64)]);
  });

  it('publishes the access preset as relay-enforced NIP-29 flags and republishes the full tag set', async () => {
    editGroupMetadata.mockResolvedValueOnce(undefined);
    const { result, onSaved } = await mount();
    act(() => result.current.setAccess('private'));
    await act(() => result.current.saveMeta());
    expect(editGroupMetadata).toHaveBeenCalledWith(expect.objectContaining({
      groupId: 'rly/chan',
      isPublic: false,
      isHidden: true,
      isRestricted: true,
      isOpen: false,
      kind: 'text',
      forumTags: GROUP.forumTags,
    }));
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(publishSfuPin).not.toHaveBeenCalled();
  });

  it('keeps the form open with the error when the relay rejects the metadata', async () => {
    editGroupMetadata.mockRejectedValueOnce(new Error('restricted: not an admin'));
    const { result, onSaved } = await mount();
    await act(() => result.current.saveMeta());
    expect(result.current.metaError).toBe('restricted: not an admin');
    expect(onSaved).not.toHaveBeenCalled();
    expect(result.current.savingMeta).toBe(false);
  });
});

describe('useChannelSettingsForm: SFU guard', () => {
  it('refuses to switch to voice-sfu when the SFU does not answer, and never touches the metadata', async () => {
    fetchSfuInfo.mockRejectedValueOnce(new Error('sfu unreachable'));
    const { result, onSaved } = await mount();
    act(() => result.current.setChannelKind('voice-sfu'));
    await act(() => result.current.saveMeta());
    expect(fetchSfuInfo).toHaveBeenCalledTimes(1);
    expect(editGroupMetadata).not.toHaveBeenCalled();
    expect(publishSfuPin).not.toHaveBeenCalled();
    expect(result.current.metaError).toBe('sfu unreachable');
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('verifies the SFU, saves the metadata, then publishes the pin', async () => {
    fetchSfuInfo.mockResolvedValueOnce({
      pubkey: 'f'.repeat(64),
      url: 'https://sfu.example',
      relays: ['wss://r1'],
      trustedRelays: ['wss://r1'],
      cap: 50,
      operator: null,
      region: 'sa',
    });
    editGroupMetadata.mockResolvedValueOnce(undefined);
    publishSfuPin.mockResolvedValueOnce(undefined);
    const { result, onSaved } = await mount();
    act(() => result.current.setChannelKind('voice-sfu'));
    act(() => result.current.setSfuUrl('https://sfu.example'));
    await act(() => result.current.saveMeta());
    expect(editGroupMetadata).toHaveBeenCalledWith(expect.objectContaining({ kind: 'voice-sfu' }));
    expect(publishSfuPin).toHaveBeenCalledWith('rly/chan', {
      pubkey: 'f'.repeat(64),
      url: 'https://sfu.example',
      trustedRelays: ['wss://r1'],
      relays: ['wss://r1'],
    });
    expect(publishSfuPin.mock.invocationCallOrder[0]).toBeGreaterThan(editGroupMetadata.mock.invocationCallOrder[0]);
    expect(result.current.sfuVerified).toEqual({ pubkey: 'f'.repeat(64), cap: 50, region: 'sa' });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('does not probe the SFU for other kinds', async () => {
    editGroupMetadata.mockResolvedValueOnce(undefined);
    const { result } = await mount();
    act(() => result.current.setChannelKind('voice'));
    await act(() => result.current.saveMeta());
    expect(fetchSfuInfo).not.toHaveBeenCalled();
    expect(editGroupMetadata).toHaveBeenCalledWith(expect.objectContaining({ kind: 'voice' }));
  });
});

describe('useChannelSettingsForm: members', () => {
  it('rejects garbage without calling the relay', async () => {
    const { result } = await mount();
    act(() => result.current.setNewMember('not-a-key'));
    await act(() => result.current.addMember());
    expect(result.current.memberError).toBe('Provide an npub or 64-char hex pubkey');
    expect(putUser).not.toHaveBeenCalled();
  });

  it('lower-cases a pasted upper-case hex key before putUser', async () => {
    putUser.mockResolvedValueOnce(undefined);
    const { result } = await mount();
    act(() => result.current.setNewMember('ABCDEF'.repeat(10) + 'ABCD'));
    act(() => result.current.setMakeAdmin(true));
    await act(() => result.current.addMember());
    expect(putUser).toHaveBeenCalledWith('rly/chan', 'abcdef'.repeat(10) + 'abcd', ['admin']);
    expect(result.current.newMember).toBe('');
    expect(result.current.makeAdmin).toBe(false);
  });

  it('decodes an npub', async () => {
    putUser.mockResolvedValueOnce(undefined);
    const { result } = await mount();
    // npub for 'a' * 64
    const { hexToNpub } = await import('@nostr-wot/data');
    act(() => result.current.setNewMember(hexToNpub('a'.repeat(64))));
    await act(() => result.current.addMember());
    expect(putUser).toHaveBeenCalledWith('rly/chan', 'a'.repeat(64), []);
  });
});
