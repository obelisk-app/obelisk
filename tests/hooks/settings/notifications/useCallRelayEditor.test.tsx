import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CALL_RELAYS, getPreferences, setPreference } from '@/services/preferences/preferences';
import { useCallRelayEditor } from '@/hooks/settings/notifications/useCallRelayEditor';

beforeEach(() => setPreference('callRelays', [...DEFAULT_CALL_RELAYS]));

describe('useCallRelayEditor', () => {
  it('edits, adds, removes and resets rows, clearing the status each time', () => {
    const onStatus = vi.fn();
    const { result } = renderHook(() => useCallRelayEditor(['wss://a.example'], onStatus));
    act(() => result.current.change(0, 'wss://b.example'));
    act(() => result.current.add());
    expect(result.current.draft).toEqual(['wss://b.example', '']);
    act(() => result.current.remove(0));
    expect(result.current.draft).toEqual(['']);
    act(() => result.current.reset());
    expect(result.current.draft).toEqual([...DEFAULT_CALL_RELAYS]);
    expect(onStatus.mock.calls.every(([s]) => s === 'idle')).toBe(true);
    expect(onStatus).toHaveBeenCalledTimes(4);
  });

  it('saves a good list and refuses a bad one', () => {
    const onStatus = vi.fn();
    const { result } = renderHook(() => useCallRelayEditor(['https://bad.example'], onStatus));
    act(() => result.current.save());
    expect(onStatus).toHaveBeenLastCalledWith('invalid');
    expect(getPreferences().callRelays).toEqual([...DEFAULT_CALL_RELAYS]);
    act(() => result.current.change(0, ' wss://good.example '));
    act(() => result.current.save());
    expect(onStatus).toHaveBeenLastCalledWith('saved');
    expect(getPreferences().callRelays).toEqual(['wss://good.example']);
  });
});
