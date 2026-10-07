import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useRelaySettingsModal } from '@/hooks/shell/modals/relay/useRelaySettingsModal';

describe('useRelaySettingsModal', () => {
  it('lists the tools in order, and each closes the menu before opening', () => {
    const calls: string[] = [];
    const spy = (name: string) => () => { calls.push(name); };
    const { result } = renderHook(() => useRelaySettingsModal({
      onClose: spy('close'), onBranding: spy('branding'), onEmojis: spy('emojis'),
      onLayout: spy('layout'), onMembers: spy('members'), onRoles: spy('roles'),
    }));
    expect(result.current.items.map((i) => i.kind)).toEqual(['profile', 'emoji', 'channels', 'roles', 'members']);
    result.current.items[3].open();
    expect(calls).toEqual(['close', 'roles']);
  });
});
